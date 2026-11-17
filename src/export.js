// Arkki report workbook: one sheet per student, laid out like the 6A1 template,
// with a radar chart (đầu kỳ vs cuối kỳ) injected as raw DrawingML.
// Needs globals ExcelJS and JSZip.
const ArkkiExport = (() => {
  const GREEN = 'FF95C230', PINK = 'FFE23985', GREY = 'FFD9D9D9';
  const FONT = 'Times New Roman';
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Cells starting with a formula character would be evaluated by Excel.
  const safeText = s => { s = s == null ? '' : String(s); return /^[=+\-@]/.test(s) ? "'" + s : s; };

  function estLines(text, charsPerLine) {
    return String(text || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  }

  function sheetNameFor(name, used) {
    let base = String(name || 'HS').replace(/[\\\/\?\*\[\]:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'HS';
    let n = base, i = 2;
    while (used.has(n.toLowerCase())) n = base.slice(0, 28) + ' ' + i++;
    used.add(n.toLowerCase());
    return n;
  }

  function style(cell, o = {}) {
    cell.font = { name: FONT, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: o.color ? { argb: o.color } : undefined };
    if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    cell.alignment = { horizontal: o.h, vertical: o.v || 'middle', wrapText: o.wrap !== false, textRotation: o.rot };
    if (o.border) cell.border = box;
    if (o.fmt) cell.numFmt = o.fmt;
  }

  function radarXml(sheetName, catRef, baseRef, finalRef, names, base, fin, maxLevel) {
    const q = "'" + sheetName.replace(/'/g, "''") + "'!";
    const strCache = '<c:strCache><c:ptCount val="' + names.length + '"/>' + names.map((n, i) => '<c:pt idx="' + i + '"><c:v>' + xmlEsc(n) + '</c:v></c:pt>').join('') + '</c:strCache>';
    const numCache = (vals, fmt) => '<c:numCache><c:formatCode>' + fmt + '</c:formatCode><c:ptCount val="' + vals.length + '"/>' +
      vals.map((v, i) => v == null ? '' : '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>').join('') + '</c:numCache>';
    const ser = (idx, label, ref, vals, color, fmt) =>
      '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/><c:tx><c:v>' + xmlEsc(label) + '</c:v></c:tx>' +
      '<c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:ln></c:spPr>' +
      '<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:ln></c:spPr></c:marker>' +
      '<c:cat><c:strRef><c:f>' + xmlEsc(q + catRef) + '</c:f>' + strCache + '</c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + xmlEsc(q + ref) + '</c:f>' + numCache(vals, fmt) + '</c:numRef></c:val></c:ser>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' +
      '<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>' +
      ser(0, 'Giáo viên nhận xét đầu kỳ', baseRef, base, '4472C4', '#,##0') +
      ser(1, 'Giáo viên nhận xét cuối kỳ', finalRef, fin, '70AD47', '#,##0.00') +
      '<c:axId val="101"/><c:axId val="102"/></c:radarChart>' +
      '<c:catAx><c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>' +
      '<c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/><c:max val="' + maxLevel + '"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>' +
      '<c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="B7B7B7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
      '<c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="101"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="1"/></c:valAx>' +
      '</c:plotArea><c:legend><c:legendPos val="t"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
      '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
      '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100"><a:latin typeface="Times New Roman"/><a:cs typeface="Times New Roman"/></a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>' +
      '</c:chartSpace>';
  }

  function chartAnchor(rId, fromCol, fromRow, toCol, toRow, id) {
    return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>' + fromCol + '</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>' + fromRow + '</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>' + toCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + toRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + id + '" name="Biểu đồ ' + id + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="' + rId + '"/>' +
      '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }

  // data: see app.js buildExportData()
  async function build(data) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Arkki Việt Nam';
    const img = {
      logo: wb.addImage({ base64: data.images.logo, extension: 'png' }),
      tag: wb.addImage({ base64: data.images.tagline, extension: 'png' }),
      sign: wb.addImage({ base64: data.images.signature, extension: 'png' }),
    };
    const comps = data.comps;
    const k = comps.length;
    const C = { stt: 2, date: 3, proj: 4, c0: 5 };
    C.note = C.c0 + k;
    C.end = C.note + 1;
    const L = n => colLetter(n);
    const last = L(C.note);
    const charts = [];
    const used = new Set();

    for (const st of data.students) {
      const name = sheetNameFor(st.name, used);
      const ws = wb.addWorksheet(name, {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
          margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
        views: [{ showGridLines: false }],
      });
      ws.getColumn(1).width = 0.6;
      ws.getColumn(C.stt).width = 6.7;
      ws.getColumn(C.date).width = 11.5;
      ws.getColumn(C.proj).width = 24;
      for (let i = 0; i < k; i++) ws.getColumn(C.c0 + i).width = k > 3 ? 6.2 : 7.5;
      ws.getColumn(C.note).width = 40;
      ws.getColumn(C.end).width = 0.6;
      const merge = (r1, c1, r2, c2) => ws.mergeCells(r1, c1, r2, c2);

      // Header
      ws.getRow(1).height = 8;
      ws.getRow(2).height = 62;
      merge(2, C.proj, 2, C.note);
      const t = ws.getCell(2, C.proj); t.value = data.title; style(t, { bold: true, size: 16, color: PINK, h: 'center' });
      ws.addImage(img.logo, { tl: { col: 1.05, row: 1.15 }, ext: { width: 150, height: 60 } });
      ws.addImage(img.tag, { tl: { col: 1.05, row: 1.83 }, ext: { width: 165, height: 15 } });
      ws.getRow(3).height = 22;
      merge(3, C.proj, 3, C.note);
      const s3 = ws.getCell(3, C.proj);
      if (st.draft) { s3.value = data.semesterLabel + '  ·  BẢN NHÁP – CHƯA DUYỆT'; style(s3, { bold: true, color: 'FFC00000', h: 'center' }); }
      else { s3.value = data.semesterLabel; style(s3, { bold: true, h: 'center' }); }

      const head = [[C.stt, C.proj, 'Trường', data.schoolName], [C.c0, C.c0 + k - 1, 'Lớp', data.className], [C.note, C.note, 'Học sinh', st.name]];
      ws.getRow(4).height = 20; ws.getRow(5).height = 30;
      for (const [a, b, label, val] of head) {
        if (b > a) { merge(4, a, 4, b); merge(5, a, 5, b); }
        const h = ws.getCell(4, a); h.value = label; style(h, { bold: true, fill: GREEN, h: 'center' });
        const v = ws.getCell(5, a); v.value = safeText(val); style(v, { bold: true, fill: GREEN, color: PINK, h: 'center' });
      }
      // Chart band
      ws.getRow(6).height = 215;
      merge(6, C.stt, 6, C.note);

      // Table header
      const hr = 7;
      ws.getRow(hr).height = k > 3 ? 100 : 80;
      const heads = [[C.stt, 'STT'], [C.date, 'Ngày'], [C.proj, 'Dự án']].concat(comps.map((c, i) => [C.c0 + i, c.name])).concat([[C.note, 'Nhận xét hằng ngày']]);
      for (const [col, label] of heads) {
        const c = ws.getCell(hr, col); c.value = label;
        style(c, { bold: true, fill: GREEN, h: 'center', border: true, rot: col >= C.c0 && col < C.note ? 90 : undefined });
      }

      // Lesson rows
      const r0 = hr + 1;
      st.rows.forEach((row, i) => {
        const r = r0 + i;
        const cells = [
          [C.stt, i + 1, { h: 'center' }],
          [C.date, row.date ? new Date(row.date + 'T00:00:00Z') : null, { h: 'center', fmt: 'dd/mm/yyyy' }],
          [C.proj, safeText(row.project), {}],
        ];
        comps.forEach((c, j) => cells.push([C.c0 + j, row.absent ? null : (row.scores[c.code] ?? null), { h: 'center', fmt: '#,##0' }]));
        cells.push([C.note, safeText(row.absent ? (row.note || 'Vắng') : row.note), { h: 'justify' }]);
        for (const [col, v, o] of cells) { const c = ws.getCell(r, col); c.value = v; style(c, Object.assign({ border: true }, o)); }
        const lines = Math.max(estLines(row.note, 44), estLines(row.project, 24), 1);
        ws.getRow(r).height = Math.min(409, Math.max(30, lines * 15 + 6));
      });
      const rEnd = r0 + st.rows.length - 1;

      // Final (average of lessons 2..N) row
      const rt = rEnd + 1;
      ws.getRow(rt).height = 32;
      for (let col = C.stt; col <= C.note; col++) style(ws.getCell(rt, col), { bold: true, fill: GREY, border: true, h: col >= C.c0 && col < C.note ? 'center' : 'left' });
      ws.getCell(rt, C.proj).value = data.totalLabel;
      comps.forEach((c, j) => {
        const col = C.c0 + j, cl = L(col), v = st.final[c.code];
        const cell = ws.getCell(rt, col);
        cell.value = st.rows.length > 1
          ? { formula: 'IFERROR(AVERAGE(' + cl + (r0 + 1) + ':' + cl + rEnd + '),"")', result: v == null ? '' : Math.round(v * 100) / 100 }
          : null;
        cell.numFmt = '#,##0.00';
      });

      // Semester comment block: one row per paragraph group, label merged down
      const paras = String(st.comment || '').split(/\n/);
      const groups = []; let cur = [];
      for (const p of paras) {
        cur.push(p);
        if (estLines(cur.join('\n'), 92) * 15 > 380) { groups.push(cur.slice(0, -1).join('\n')); cur = [p]; }
      }
      groups.push(cur.join('\n'));
      const rc = rt + 1;
      groups.forEach((g, i) => {
        const r = rc + i;
        merge(r, C.proj, r, C.note);
        const c = ws.getCell(r, C.proj); c.value = safeText(g); style(c, { border: true, h: 'left', v: 'top' });
        ws.getRow(r).height = Math.min(409, Math.max(40, estLines(g, 92) * 15 + 10));
      });
      const rcEnd = rc + groups.length - 1;
      merge(rc, C.stt, rcEnd, C.date);
      const lab = ws.getCell(rc, C.stt); lab.value = 'Nhận xét chung\n' + data.semesterShort; style(lab, { bold: true, fill: GREEN, h: 'center', border: true });
      for (let r = rc; r <= rcEnd; r++) for (let col = C.stt; col <= C.note; col++) ws.getCell(r, col).border = box;

      // Signature
      let r = rcEnd + 2;
      const sig = ws.getCell(r, C.note); sig.value = data.signerTitle; style(sig, { bold: true, h: 'center' });
      ws.getRow(r + 1).height = 75;
      // A draft carries no signature: only an approved report is signed.
      if (st.draft) { const d = ws.getCell(r + 1, C.note); d.value = 'BẢN NHÁP – chưa ký'; style(d, { bold: true, color: 'FFC00000', h: 'center' }); }
      else ws.addImage(img.sign, { tl: { col: C.note - 1 + 0.25, row: r + 0.1 }, ext: { width: 150, height: 99 } });
      const sn = ws.getCell(r + 2, C.note); sn.value = data.signerName; style(sn, { italic: true, h: 'center' });
      r += 4;

      // Overview + level legend
      merge(r, C.stt, r, C.note);
      const ov = ws.getCell(r, C.stt); ov.value = data.overview; style(ov, { h: 'justify' });
      ws.getRow(r).height = Math.min(409, estLines(data.overview, 105) * 15 + 8);
      r += 2;
      const lt = ws.getCell(r, C.stt); lt.value = 'Các cấp độ dựa theo thể hiện trong quá trình nhận xét:'; style(lt, { bold: true, wrap: false });
      r += 1;
      const legendHead = r;
      merge(r, C.date, r, C.proj); merge(r, C.c0, r, C.note);
      [[C.stt, 'STT'], [C.date, 'Cấp độ'], [C.c0, 'Biểu hiện']].forEach(([col, v]) => { const c = ws.getCell(r, col); c.value = v; style(c, { bold: true, fill: GREEN, h: 'center', border: true }); });
      data.levels.forEach((lv, i) => {
        r++;
        merge(r, C.date, r, C.proj); merge(r, C.c0, r, C.note);
        const a = ws.getCell(r, C.stt); a.value = i + 1; style(a, { h: 'center', border: true });
        const b = ws.getCell(r, C.date); b.value = lv.name; style(b, { border: true });
        const d = ws.getCell(r, C.c0); d.value = lv.desc; style(d, { border: true });
        ws.getRow(r).height = Math.max(24, estLines(lv.desc, 60) * 15 + 8);
      });
      for (let rr = legendHead; rr <= r; rr++) for (let col = C.stt; col <= C.note; col++) ws.getCell(rr, col).border = box;
      r += 2;
      const ct = ws.getCell(r, C.stt); ct.value = 'Thông tin liên hệ Arkki'; style(ct, { bold: true, wrap: false });
      for (const line of data.contact) { r++; const c = ws.getCell(r, C.stt); c.value = line; style(c, { wrap: false }); }

      ws.pageSetup.printArea = 'B1:' + last + r;

      const catRef = '$' + L(C.c0) + '$' + hr + ':$' + L(C.c0 + k - 1) + '$' + hr;
      const baseRef = '$' + L(C.c0) + '$' + r0 + ':$' + L(C.c0 + k - 1) + '$' + r0;
      const finRef = '$' + L(C.c0) + '$' + rt + ':$' + L(C.c0 + k - 1) + '$' + rt;
      charts.push({
        sheetIndex: wb.worksheets.length,
        xml: radarXml(name, catRef, baseRef, finRef, comps.map(c => c.name),
          comps.map(c => st.baseline[c.code] ?? null), comps.map(c => st.final[c.code] == null ? null : Math.round(st.final[c.code] * 100) / 100), data.maxLevel),
        anchor: [C.stt - 1, 5, C.note, 6],
      });
    }

    if (!data.students.length) wb.addWorksheet('Trống');
    const buf = await wb.xlsx.writeBuffer();
    return injectCharts(buf, charts);
  }

  async function injectCharts(buf, charts) {
    const zip = await JSZip.loadAsync(buf);
    let ct = await zip.file('[Content_Types].xml').async('string');
    let n = 0;
    for (const ch of charts) {
      n++;
      const relsPath = 'xl/worksheets/_rels/sheet' + ch.sheetIndex + '.xml.rels';
      const rels = await zip.file(relsPath).async('string');
      const m = rels.match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/);
      if (!m) throw new Error('Không tìm thấy drawing cho sheet ' + ch.sheetIndex);
      const dPath = 'xl/drawings/' + m[1];
      const dRelsPath = 'xl/drawings/_rels/' + m[1] + '.rels';
      zip.file('xl/charts/chart' + n + '.xml', ch.xml);
      let drels = zip.file(dRelsPath) ? await zip.file(dRelsPath).async('string')
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      const rId = 'rIdArkkiChart' + n;
      drels = drels.replace('</Relationships>', '<Relationship Id="' + rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + n + '.xml"/></Relationships>');
      zip.file(dRelsPath, drels);
      let d = (await zip.file(dPath).async('string')).replace(/<xdr:oneCellAnchor editAs="[^"]*">/g, '<xdr:oneCellAnchor>');
      const [fc, fr, tc, tr] = ch.anchor;
      d = d.replace('</xdr:wsDr>', chartAnchor(rId, fc, fr, tc, tr, 900 + n) + '</xdr:wsDr>');
      zip.file(dPath, d);
      ct = ct.replace('</Types>', '<Override PartName="/xl/charts/chart' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
    }
    zip.file('[Content_Types].xml', ct);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }

  return { build };
})();
