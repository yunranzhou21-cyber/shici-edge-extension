"""Small original PDFs for local browser tests; no user files or network."""
import pathlib
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter
root=pathlib.Path(__file__).resolve().parents[1]/'tests'/'fixtures'
root.mkdir(parents=True,exist_ok=True)
pdf=canvas.Canvas(str(root/'reading.pdf'),pagesize=(612,792))
for number,title,sentence in [(1,'Reading with Shici','An example can make an idea clear.'),(2,'A new context','Running a project takes patience.')]:
    pdf.setFillColor(HexColor('#2e624e'));pdf.setFont('Helvetica-Bold',26);pdf.drawString(60,706,title)
    pdf.setFillColor(HexColor('#334838'));pdf.setFont('Helvetica',17);pdf.drawString(60,638,sentence)
    pdf.setFont('Helvetica',12);pdf.drawString(60,602,'Select a word, look it up, then save its context.')
    pdf.setStrokeColor(HexColor('#cfdcc7'));pdf.line(60,570,552,570)
    pdf.setFont('Helvetica',10);pdf.drawString(60,54,f'Original test document - page {number}');pdf.showPage()
pdf.save()
scanned=canvas.Canvas(str(root/'image-only.pdf'),pagesize=(612,792));scanned.setFillColor(HexColor('#d8e4d0'));scanned.rect(60,300,492,300,fill=1,stroke=0);scanned.save()
writer=PdfWriter();writer.append(PdfReader(str(root/'reading.pdf')));writer.encrypt('fixture-password');writer.write(str(root/'encrypted.pdf'))
print('Created three local PDF fixtures')
