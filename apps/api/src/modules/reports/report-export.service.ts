import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportResult } from './reports.service';

export interface ExportedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/** Renders a generated report into CSV, Excel or PDF. */
@Injectable()
export class ReportExportService {
  async export(report: ReportResult, format: 'csv' | 'excel' | 'pdf'): Promise<ExportedFile> {
    switch (format) {
      case 'excel':
        return this.toExcel(report);
      case 'pdf':
        return this.toPdf(report);
      default:
        return this.toCsv(report);
    }
  }

  private fileName(report: ReportResult, extension: string): string {
    const stamp = report.generatedAt.toISOString().slice(0, 10);
    return 'orgflow-' + report.type + '-' + stamp + '.' + extension;
  }

  /** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
  private csvCell(value: unknown): string {
    const raw = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
  }

  private toCsv(report: ReportResult): ExportedFile {
    const lines: string[] = [];
    lines.push(this.csvCell(report.title));
    lines.push(this.csvCell('Generated ' + report.generatedAt.toISOString()));
    lines.push('');
    lines.push(report.columns.map((column) => this.csvCell(column.label)).join(','));

    for (const row of report.rows) {
      lines.push(report.columns.map((column) => this.csvCell(row[column.key])).join(','));
    }

    if (report.summary.length > 0) {
      lines.push('');
      lines.push(this.csvCell('Summary'));
      for (const entry of report.summary) {
        lines.push([this.csvCell(entry.label), this.csvCell(entry.value)].join(','));
      }
    }

    // BOM so Excel opens UTF-8 correctly.
    return {
      buffer: Buffer.from('﻿' + lines.join('\r\n'), 'utf8'),
      fileName: this.fileName(report, 'csv'),
      mimeType: 'text/csv; charset=utf-8',
    };
  }

  private async toExcel(report: ReportResult): Promise<ExportedFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OrgFlow';
    workbook.created = report.generatedAt;

    const sheet = workbook.addWorksheet('Report', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    sheet.mergeCells(1, 1, 1, Math.max(report.columns.length, 1));
    const titleCell = sheet.getCell('A1');
    titleCell.value = report.title;
    titleCell.font = { size: 14, bold: true, color: { argb: 'FF0F172A' } };

    sheet.mergeCells(2, 1, 2, Math.max(report.columns.length, 1));
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value =
      report.description + '  |  Generated ' + report.generatedAt.toISOString().slice(0, 16).replace('T', ' ');
    subtitleCell.font = { size: 10, color: { argb: 'FF64748B' } };

    const headerRow = sheet.getRow(4);
    headerRow.values = report.columns.map((column) => column.label);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 20;

    for (const row of report.rows) {
      sheet.addRow(report.columns.map((column) => row[column.key] ?? ''));
    }

    report.columns.forEach((column, index) => {
      const values = report.rows.map((row) => String(row[column.key] ?? ''));
      const longest = Math.max(column.label.length, ...values.map((value) => value.length), 8);
      sheet.getColumn(index + 1).width = Math.min(longest + 4, 52);
      if (column.numeric) sheet.getColumn(index + 1).alignment = { horizontal: 'right' };
    });

    if (report.summary.length > 0) {
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'label', width: 34 },
        { header: 'Value', key: 'value', width: 22 },
      ];
      summarySheet.getRow(1).font = { bold: true };
      for (const entry of report.summary) {
        summarySheet.addRow({ label: entry.label, value: entry.value });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      fileName: this.fileName(report, 'xlsx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private toPdf(report: ReportResult): Promise<ExportedFile> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          fileName: this.fileName(report, 'pdf'),
          mimeType: 'application/pdf',
        }),
      );

      const pageWidth = document.page.width - 72;

      document.fillColor('#0F172A').fontSize(18).text(report.title);
      document
        .fillColor('#64748B')
        .fontSize(9)
        .text(report.description)
        .text('Generated ' + report.generatedAt.toISOString().slice(0, 16).replace('T', ' '));
      document.moveDown(0.8);

      if (report.summary.length > 0) {
        document.fillColor('#0F172A').fontSize(11).text('Summary');
        document.moveDown(0.3);
        document.fontSize(9).fillColor('#334155');
        for (const entry of report.summary) {
          document.text(entry.label + ': ' + entry.value);
        }
        document.moveDown(0.8);
      }

      const columnWidth = pageWidth / Math.max(report.columns.length, 1);
      const rowHeight = 18;

      const drawHeader = () => {
        const top = document.y;
        document.rect(36, top, pageWidth, rowHeight).fill('#4338CA');
        document.fillColor('#FFFFFF').fontSize(8);
        report.columns.forEach((column, index) => {
          document.text(column.label, 40 + index * columnWidth, top + 5, {
            width: columnWidth - 8,
            ellipsis: true,
          });
        });
        document.y = top + rowHeight;
      };

      drawHeader();

      report.rows.forEach((row, rowIndex) => {
        if (document.y + rowHeight > document.page.height - 48) {
          document.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
          drawHeader();
        }
        const top = document.y;
        if (rowIndex % 2 === 1) {
          document.rect(36, top, pageWidth, rowHeight).fill('#F1F5F9');
        }
        document.fillColor('#0F172A').fontSize(8);
        report.columns.forEach((column, index) => {
          document.text(String(row[column.key] ?? ''), 40 + index * columnWidth, top + 5, {
            width: columnWidth - 8,
            ellipsis: true,
          });
        });
        document.y = top + rowHeight;
      });

      if (report.rows.length === 0) {
        document.moveDown(1).fillColor('#64748B').fontSize(10).text('No data for these filters.');
      }

      document.end();
    });
  }
}
