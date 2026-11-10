"""Generate synthetic procurement data and actual PDF inputs. No runtime decisions here."""
from pathlib import Path
import json,csv,io
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
import fitz
ROOT=Path(__file__).resolve().parents[1]/'datasets'
(ROOT/'invoices').mkdir(parents=True,exist_ok=True)
vendors=[{'id':'V001','name':'Apex Office Supplies','aliases':['Apex Office Supplies Pvt Ltd'],'approved':True}, {'id':'V002','name':'Nova IT Services','aliases':[],'approved':True}, {'id':'V003','name':'Vertex Equipment','aliases':[],'approved':True}, {'id':'V004','name':'Harbor Logistics','aliases':[],'approved':False}, {'id':'V005','name':'Cedar Design Studio','aliases':[],'approved':True}]
pos=[{'id':p,'vendor_id':v,'currency':c,'amount':a,'baseline_billed':b,'description':d} for p,v,c,a,b,d in [('PO-101','V001','INR','50000.00','0.00','Office equipment'),('PO-102','V002','INR','80000.00','30000.00','IT support contract'),('PO-103','V003','INR','25000.00','0.00','Equipment rental'),('PO-104','V005','INR','30000.00','0.00','Brand refresh'),('PO-105','V005','INR','30000.00','0.00','Website design'),('PO-106','V004','INR','20000.00','0.00','Transport services'),('PO-107','V003','USD','2000.00','0.00','Imported equipment'),('PO-108','V001','INR','10000.00','0.00','Stationery replenishment')]]
for name,data in [('vendors',vendors),('purchase_orders',pos)]:
 (ROOT/f'{name}.json').write_text(json.dumps(data,indent=2))
 with (ROOT/f'{name}.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=data[0].keys());w.writeheader();w.writerows(data)
scenarios=[
 ('01-clean','Clean invoice','Apex Office Supplies','INV-204','PO-101','40000.00','7200.00','47200.00','INR','APPROVED','All checks pass. Run this first.'),
 ('02-renamed-duplicate','Duplicate, different layout','Apex Office Supplies Pvt Ltd','inv 204','PO-101','40000.00','7200.00','47200.00','INR','REJECTED','Run after 01. Alias and normalized invoice ID reveal a duplicate despite a different PDF.'),
 ('03-partial-first','Partial billing: first installment','Nova IT Services','NOVA-301','PO-102','25000.00','0.00','25000.00','INR','APPROVED','Baseline billed is 30,000. Remaining balance falls from 50,000 to 25,000.'),
 ('04-partial-overrun','Partial billing: overrun','Nova IT Services','NOVA-302','PO-102','30000.00','0.00','30000.00','INR','REJECTED','Run after 03. Cumulative billing becomes 85,000 against an 80,000 PO.'),
 ('05-ambiguous','Missing PO, two candidates','Cedar Design Studio','CED-501',None,'20000.00','0.00','20000.00','INR','REVIEW','Two open POs fit. Never guess which one.'),
 ('06-math-mismatch','Plausible total, broken arithmetic','Vertex Equipment','VER-601','PO-103','20000.00','3600.00','24000.00','INR','REVIEW','Subtotal + tax is 23,600, not the printed 24,000.'),
 ('07-unapproved','Unapproved vendor','Harbor Logistics','HAR-701','PO-106','10000.00','0.00','10000.00','INR','REJECTED','The PO exists but this vendor is not approved.'),
 ('08-missing-number','Missing invoice identity','Vertex Equipment',None,'PO-103','10000.00','0.00','10000.00','INR','REVIEW','Missing invoice number prevents reliable deduplication.'),
 ('09-currency','Currency disagreement','Vertex Equipment','VER-901','PO-107','1500.00','0.00','1500.00','INR','REVIEW','PO is USD; invoice is INR. No implicit exchange-rate conversion.'),
 ('10-tolerance','Small rounding variance','Apex Office Supplies','APX-1001','PO-108','10050.00','0.00','10050.00','INR','APPROVED','50 above PO is within the configured min(1% of PO, 100) cumulative tolerance.'),
 ('11-scanned','Image-only scanned PDF','Vertex Equipment','VER-1101','PO-103','8000.00','0.00','8000.00','INR','APPROVED','Real image-only PDF; requires Tesseract OCR. Low OCR quality routes to review.'),
 ('12-wrong-vendor','PO belongs to another vendor','Nova IT Services','NOVA-1201','PO-103','10000.00','0.00','10000.00','INR','REJECTED','An explicit PO reference is not proof the vendor owns it.')]
manifest=[]
for i,(slug,title,v,number,po,sub,tax,total,currency,expected,note) in enumerate(scenarios):
 path=ROOT/'invoices'/f'{slug}.pdf'; buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(595,842));c.setTitle(title)
 accent='#123a32' if i%2==0 else '#263d65'
 c.setFillColor(HexColor(accent));c.rect(0,720,595,122,fill=1,stroke=0)
 c.setFillColor(HexColor('#ffffff'));c.setFont('Helvetica-Bold',26);c.drawString(42,783,'INVOICE');c.setFont('Helvetica',11);c.drawString(42,753,'SYNTHETIC DEMO DOCUMENT - NOT PAYABLE')
 c.setFillColor(HexColor('#192e29'));c.setFont('Helvetica',12)
 rows=[('Vendor',v),('Invoice number',number),('Invoice date','2026-11-01'),('PO reference',po),('Currency',currency)]
 y=670
 for label,value in rows:
  if value is not None: c.drawString(42,y,f'{label}: {value}');y-=31
 c.setStrokeColor(HexColor('#d7dfda'));c.line(42,480,553,480)
 c.setFont('Helvetica-Bold',11);c.drawString(42,450,'DESCRIPTION');c.drawString(440,450,'NET AMOUNT')
 c.setFont('Helvetica',11);c.drawString(42,415,'Contracted goods / services (bundled)');c.drawString(440,415,sub)
 y=330
 for label,value in [('Subtotal',sub),('Tax',tax),('Total',total)]:
  c.setFont('Helvetica-Bold' if label=='Total' else 'Helvetica',14);c.drawString(330,y,f'{label}: {value}');y-=36
 c.setFont('Helvetica',10);c.drawString(42,135,'Amounts include tax only where shown. Payment is subject to buyer approval.')
 c.drawString(42,110,'Invoice Lens test fixture | Fictional companies and transactions');c.save()
 if slug=='11-scanned':
  doc=fitz.open(stream=buf.getvalue(),filetype='pdf');pix=doc[0].get_pixmap(matrix=fitz.Matrix(2,2));out=fitz.open();page=out.new_page(width=595,height=842);page.insert_image(page.rect,stream=pix.tobytes('png'));out.save(path)
 else:path.write_bytes(buf.getvalue())
 manifest.append({'id':slug,'title':title,'file':path.name,'expected':expected,'note':note})
(ROOT/'scenarios.json').write_text(json.dumps(manifest,indent=2))
print(f'Generated {len(vendors)} vendors, {len(pos)} POs, {len(manifest)} invoice PDFs.')
