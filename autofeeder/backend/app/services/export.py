"""CSV and PDF export helpers."""
from __future__ import annotations

import csv
import io
from typing import Iterable, Sequence

from fastapi import Response

CSV_HEADERS = {
    "Content-Type": "text/csv; charset=utf-8",
}


def csv_response(filename: str, header: Sequence[str], rows: Iterable[Sequence[object]]) -> Response:
    buffer = io.StringIO()
    buffer.write("\ufeff")  # Excel-friendly UTF-8 BOM
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={**CSV_HEADERS, "Content-Disposition": f'attachment; filename="{filename}"'},
    )


def pdf_table_response(
    *,
    filename: str,
    title: str,
    subtitle: str,
    header: Sequence[str],
    rows: Iterable[Sequence[object]],
    landscape: bool = True,
) -> Response:
    """Render a compact, printable report as a real PDF (not a browser print dialog)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape as landscape_page
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    pagesize = landscape_page(A4) if landscape else A4
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=title,
        author="AutoFeeder Rail Gantry",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#0a4d2d"),
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#555555"),
        spaceAfter=8,
    )
    cell_style = ParagraphStyle(
        "ReportCell",
        parent=styles["Normal"],
        fontSize=6.8,
        leading=8.2,
    )
    head_style = ParagraphStyle(
        "ReportHead",
        parent=styles["Normal"],
        fontSize=7,
        leading=8.5,
        textColor=colors.white,
        fontName="Helvetica-Bold",
    )

    def text(value: object) -> str:
        if value is None:
            return "—"
        return str(value)

    body: list[list[object]] = [
        [Paragraph(text(value).replace("&", "&amp;"), head_style) for value in header]
    ]
    row_count = 0
    for row in rows:
        if row_count >= 5000:
            break
        body.append([Paragraph(text(value).replace("&", "&amp;"), cell_style) for value in row])
        row_count += 1

    if row_count == 0:
        body.append(
            [
                Paragraph("Tidak ada data pada filter ini.", cell_style)
                for _ in range(max(1, len(header)))
            ]
        )

    available = pagesize[0] - 20 * mm
    column_width = available / max(1, len(header))
    table = Table(body, colWidths=[column_width] * len(header), repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a6b3d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#b8c4bd")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f7f5")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    story = [
        Paragraph(title, title_style),
        Paragraph(subtitle, subtitle_style),
        table,
        Spacer(1, 4 * mm),
        Paragraph(
            "AutoFeeder Rail Gantry · waktu WIB · dibuat otomatis oleh sistem.",
            subtitle_style,
        ),
    ]
    doc.build(story)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
