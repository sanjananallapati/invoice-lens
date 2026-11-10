"""Read every PDF page; OCR image-only pages. Output JSON, never shell-evaluate input."""
import sys,json,subprocess,tempfile
from pathlib import Path
import fitz

def read_pdf(path):
 doc=fitz.open(path)
 if doc.needs_pass:raise ValueError('Password-protected PDFs are not supported. Upload an unlocked copy.')
 if not 1<=len(doc)<=10:raise ValueError('Upload between 1 and 10 pages.')
 pages=[];qualities=[]
 for n,page in enumerate(doc):
  text=page.get_text('text',sort=True).strip();method='embedded text'
  if len(text)<60:
   method='Tesseract OCR'
   with tempfile.TemporaryDirectory() as tmp:
    img=Path(tmp)/'page.png';scale=min(2,2400/max(page.rect.width,page.rect.height));page.get_pixmap(matrix=fitz.Matrix(scale,scale)).save(str(img))
    p=subprocess.run(['tesseract',str(img),'stdout','--psm','6','tsv'],capture_output=True,text=True,timeout=30)
    if p.returncode:raise ValueError('OCR failed. Check Tesseract installation and document quality.')
    lines={};conf=[]
    for row in p.stdout.splitlines()[1:]:
     parts=row.split('\t',11)
     if len(parts)<12 or not parts[11].strip():continue
     key=tuple(parts[1:5]);lines.setdefault(key,[]).append(parts[11]);score=float(parts[10])
     if score>=0:conf.append(score)
    text='\n'.join(' '.join(words) for words in lines.values());qualities.extend(conf)
  pages.append({'page':n+1,'method':method,'text':text})
 combined='\n\n'.join(p['text'] for p in pages)
 if len(combined)>60000:raise ValueError('Extracted text is too long. Split the document into smaller invoices.')
 return {'text':combined,'pages':pages,'ocrConfidence':round(sum(qualities)/len(qualities),1) if qualities else None}
if __name__=='__main__':
 try: print(json.dumps(read_pdf(sys.argv[1])))
 except Exception as e: print(json.dumps({'error':str(e)}));sys.exit(1)
