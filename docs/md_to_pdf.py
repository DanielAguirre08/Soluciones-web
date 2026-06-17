#!/usr/bin/env python3
"""Convierte el INFORME_PROYECTO.md a PDF usando reportlab.
Soporta: titulos (#..####), parrafos, listas, citas (>), bloques de codigo (```)
y tablas estilo markdown (| ... |). Pensado para este informe en particular.
"""
import os
import re
import html

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Preformatted, HRFlowable, KeepTogether
)

BASE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(BASE, "INFORME_PROYECTO.md")
PDF = os.path.join(BASE, "INFORME_PROYECTO.pdf")

INK = colors.HexColor("#1a1a2e")
ACCENT = colors.HexColor("#c2185b")
LINE = colors.HexColor("#d9d9e3")
CODE_BG = colors.HexColor("#f4f4f8")
HEAD_BG = colors.HexColor("#c2185b")

styles = getSampleStyleSheet()

h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, leading=22,
                    textColor=ACCENT, spaceBefore=14, spaceAfter=8)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, leading=18,
                    textColor=INK, spaceBefore=12, spaceAfter=6)
h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=11.5, leading=15,
                    textColor=INK, spaceBefore=8, spaceAfter=4)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10, leading=14,
                      textColor=INK, spaceAfter=6, alignment=4)
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=14, bulletIndent=4, spaceAfter=2)
quote = ParagraphStyle("Quote", parent=body, leftIndent=12, textColor=colors.HexColor("#555"),
                       backColor=colors.HexColor("#fbf0f5"), borderPadding=6, spaceBefore=4)
cell = ParagraphStyle("Cell", parent=body, fontSize=8.5, leading=11, alignment=0, spaceAfter=0)
cellh = ParagraphStyle("CellH", parent=cell, textColor=colors.white, fontName="Helvetica-Bold")
code = ParagraphStyle("Code", parent=styles["Code"], fontSize=8, leading=10.5,
                      textColor=INK)
title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=22, leading=26,
                             textColor=ACCENT)


def inline(text):
    """Convierte marcas inline de markdown a etiquetas de reportlab."""
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.5">\1</font>', text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", r'<link href="\2" color="blue">\1</link>', text)
    return text


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def build():
    with open(MD, encoding="utf-8") as f:
        lines = f.readlines()

    flow = []
    i = 0
    n = len(lines)
    first_h1_done = False

    while i < n:
        line = lines[i].rstrip("\n")

        # Bloque de codigo
        if line.strip().startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i].rstrip("\n"))
                i += 1
            i += 1
            code_text = "\n".join(buf) if buf else " "
            tbl = Table([[Preformatted(code_text, code)]], colWidths=[16.5 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            flow.append(Spacer(1, 4))
            flow.append(tbl)
            flow.append(Spacer(1, 4))
            continue

        # Tabla
        if line.strip().startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            header = split_row(line)
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i].rstrip("\n")))
                i += 1
            data = [[Paragraph(inline(c), cellh) for c in header]]
            for r in rows:
                while len(r) < len(header):
                    r.append("")
                data.append([Paragraph(inline(c), cell) for c in r])
            ncols = len(header)
            total = 16.5 * cm
            col_w = [total / ncols] * ncols
            tbl = Table(data, colWidths=col_w, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#faf7f9")]),
            ]))
            flow.append(Spacer(1, 4))
            flow.append(tbl)
            flow.append(Spacer(1, 6))
            continue

        # Separador horizontal
        if line.strip() == "---":
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
            flow.append(Spacer(1, 4))
            i += 1
            continue

        # Titulos
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            txt = inline(m.group(2))
            if level == 1:
                if not first_h1_done:
                    flow.append(Paragraph(txt, title_style))
                    first_h1_done = True
                else:
                    flow.append(Paragraph(txt, h1))
            elif level == 2:
                flow.append(Paragraph(txt, h2))
            else:
                flow.append(Paragraph(txt, h3))
            i += 1
            continue

        # Cita
        if line.strip().startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            flow.append(Paragraph(inline(" ".join(buf)), quote))
            flow.append(Spacer(1, 4))
            continue

        # Listas
        if re.match(r"^\s*[-*]\s+", line):
            buf = []
            while i < n and re.match(r"^\s*[-*]\s+", lines[i]):
                item = re.sub(r"^\s*[-*]\s+", "", lines[i].rstrip("\n"))
                buf.append(Paragraph(inline(item), bullet, bulletText="\u2022"))
                i += 1
            flow.extend(buf)
            flow.append(Spacer(1, 4))
            continue

        if re.match(r"^\s*\d+\.\s+", line):
            buf = []
            while i < n and re.match(r"^\s*\d+\.\s+", lines[i]):
                num = re.match(r"^\s*(\d+)\.", lines[i]).group(1)
                item = re.sub(r"^\s*\d+\.\s+", "", lines[i].rstrip("\n"))
                buf.append(Paragraph(inline(item), bullet, bulletText=num + "."))
                i += 1
            flow.extend(buf)
            flow.append(Spacer(1, 4))
            continue

        # Linea en blanco
        if not line.strip():
            i += 1
            continue

        # Parrafo (puede continuar varias lineas)
        buf = [line]
        i += 1
        while i < n and lines[i].strip() and not re.match(
                r"^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|>|\||```|---)", lines[i]):
            buf.append(lines[i].rstrip("\n"))
            i += 1
        flow.append(Paragraph(inline(" ".join(buf)), body))

    doc = SimpleDocTemplate(
        PDF, pagesize=A4,
        leftMargin=2.2 * cm, rightMargin=2.2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Informe de Proyecto - Bambeli",
    )

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#888"))
        canvas.drawString(2.2 * cm, 1.1 * cm, "Bambeli - Informe de Soluciones Web y Aplicaciones Distribuidas")
        canvas.drawRightString(A4[0] - 2.2 * cm, 1.1 * cm, "Pag. %d" % doc_.page)
        canvas.restoreState()

    doc.build(flow, onFirstPage=footer, onLaterPages=footer)
    print("PDF generado:", PDF)


if __name__ == "__main__":
    build()
