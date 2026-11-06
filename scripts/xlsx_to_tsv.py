# Parse-only converter: dumps one sheet of an .xlsx to TSV (stdlib only, run with python -I).
# usage: python -I scripts/xlsx_to_tsv.py <in.xlsx> <sheet name> <out.tsv>
import re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

MAX_MEMBER_BYTES = 50 * 1024 * 1024


def col(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1

def main(src, sheet, out):
    z = zipfile.ZipFile(src)
    for info in z.infolist():
        if info.file_size > MAX_MEMBER_BYTES:
            sys.exit('refusing %s: member %s is %d bytes (limit %d)' % (src, info.filename, info.file_size, MAX_MEMBER_BYTES))
    ss = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rid = next(s.get('{%s}id' % NS['r']) for s in wb.find('m:sheets', NS) if s.get('name') == sheet)
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = next(r.get('Target') for r in rels if r.get('Id') == rid)
    root = ET.fromstring(z.read('xl/' + target.lstrip('/').replace('xl/', '')))
    lines = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            if c.get('t') == 'inlineStr':
                val = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
            elif v is None:
                val = ''
            elif c.get('t') == 's':
                val = ss[int(v.text)]
            else:
                val = v.text or ''
            cells[col(c.get('r'))] = re.sub(r'[\t\r\n]+', ' ', val)
        if cells:
            lines.append('\t'.join(cells.get(i, '') for i in range(max(cells) + 1)))
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit('usage: python -I scripts/xlsx_to_tsv.py <in.xlsx> <sheet name> <out.tsv>')
    main(*sys.argv[1:4])
