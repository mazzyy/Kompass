"""Render synthetic Situationsanalyse .txt files as PDFs (real reports are Word->PDF).
Usage: python3 -I scripts/pdf.py sample-data/2026-11/situationsanalyse"""
import os, re, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from xml.sax.saxutils import escape

d = sys.argv[1]
body = ParagraphStyle('b', fontName='Helvetica', fontSize=10, leading=14, spaceAfter=6)
small = ParagraphStyle('s', fontName='Helvetica', fontSize=8, leading=11, textColor=HexColor('#6B6B73'))
title = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=14, leading=18, spaceAfter=8)
h1 = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=11, leading=15, spaceBefore=10, spaceAfter=4)
h2 = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=10, leading=14, spaceBefore=4, spaceAfter=2, backColor=HexColor('#F1F0EC'))
n = 0
for f in sorted(os.listdir(d)):
    if not f.endswith('.txt'):
        continue
    lines = open(os.path.join(d, f), encoding='utf-8').read().splitlines()
    story = []
    for i, line in enumerate(lines):
        t = escape(line)
        if i < 2:
            story.append(Paragraph(t, small))
        elif line.startswith('Situationsanalyse und Potenzialerhebung'):
            story.append(Spacer(1, 6)); story.append(Paragraph(t, title))
        elif re.match(r'^\d+\.\d+ ', line):
            story.append(Paragraph(t, h2))
        elif re.match(r'^\d+\. ', line):
            story.append(Paragraph(t, h1))
        else:
            story.append(Paragraph(t, body))
    doc = SimpleDocTemplate(os.path.join(d, f[:-4] + '.pdf'), pagesize=A4, leftMargin=56, rightMargin=56, topMargin=48, bottomMargin=48,
                            title='Situationsanalyse (synthetisch)', author='Asylsozialdienst (SYNTHETISCH)')
    doc.build(story)
    n += 1
print(n, 'PDFs')
