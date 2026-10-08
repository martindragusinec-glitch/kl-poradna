#!/usr/bin/env python3
"""Označí upravitelné texty ve zdrojích webu atributem data-k (pro editor na webu, viz api/upravit.js).

  python3 tools/upravy_oznacit.py          -> doplní data-k do src/layout.html a src/pages/*.html
  python3 tools/upravy_oznacit.py --check  -> jen vypíše, kolik textů ještě označení nemá (nic nemění)

Upravitelný je prvek, který obsahuje jen text a řádkové formátování (strong, em, br, odkaz, span.todo)
a žádné zástupné značky {{…}} kromě {{link:…}} v odkazu. Holý text vedle ikony (tlačítka, nadpisy s ikonou)
se zabalí do <span data-k>. Už označené prvky zůstávají beze změny, nové dostanou další volné číslo.
Rozbalovací otázky (<details>) dostanou data-polozka: editor je umí přidat a smazat.
Po ruční úpravě stránek stačí skript spustit znovu.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {"br", "img", "input", "meta", "link", "hr", "source", "wbr", "area", "col", "embed", "param", "track"}
INLINE = {"strong", "em", "b", "i", "br", "a", "span", "small", "abbr"}
SKIP_TAGS = {"script", "style", "svg", "head", "title", "button", "select", "option", "textarea", "noscript", "template", "nav"}
ITEM_TAGS = {"details"}  # opakovatelné položky: editor je umí přidat a smazat (časté dotazy)
SKIP_CLASSES = {"brand", "skip-link", "vh", "hp", "msg__num"}
TOKEN = re.compile(
    r"<!--.*?-->|<![^>]*>"
    r"|<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*(/?)>"
    r"|\{\{.*?\}\}", re.S)
ATTR = re.compile(r"([^\s=/>]+)(?:\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+))?")


class Node:
    def __init__(self, kind, start, end, tag=None, attrs=""):
        self.kind, self.start, self.end, self.tag, self.attrs = kind, start, end, tag, attrs
        self.children, self.open_end, self.close_start = [], end, end

    def attr(self):
        return {m.group(1).lower(): (m.group(2) or "").strip("\"'") for m in ATTR.finditer(self.attrs)}


def parse(src):
    root = Node("el", 0, len(src), "#root")
    stack, pos = [root], 0
    for m in TOKEN.finditer(src):
        if m.start() > pos:
            stack[-1].children.append(Node("text", pos, m.start()))
        tok = m.group(0)
        if tok.startswith("<!"):
            stack[-1].children.append(Node("comment", m.start(), m.end()))
        elif tok.startswith("{{"):
            stack[-1].children.append(Node("ph", m.start(), m.end()))
        elif m.group(1):  # zavírací značka
            tag = m.group(2).lower()
            while len(stack) > 1:
                el = stack.pop()
                el.close_start, el.end = m.start(), m.end()
                if el.tag == tag:
                    break
        else:
            tag = m.group(2).lower()
            el = Node("el", m.start(), m.end(), tag, m.group(3))
            el.open_end = m.end()
            stack[-1].children.append(el)
            if tag not in VOID and not m.group(4):
                stack.append(el)
        pos = m.end()
    if pos < len(src):
        root.children.append(Node("text", pos, len(src)))
    return root


def text_of(src, n):
    return src[n.start:n.end]


def has_words(s):
    return bool(re.sub(r"&nbsp;|\s", "", s))


def skipped(el):
    a = el.attr()
    if el.tag in SKIP_TAGS or "hidden" in a or "aria-live" in a or a.get("role") in ("status", "alert"):
        return True
    return bool(SKIP_CLASSES & set(a.get("class", "").split()))


def js_hook(el):
    """Prvek s data-* atributem mění skript (počítadlo znaků, stavové hlášky): neoznačovat, ale projít dovnitř."""
    return any(k.startswith("data-") and k != "data-k" for k in el.attr())


def inline_ok(el):
    """Smí být uvnitř upravitelného textu (editor ho umí uložit beze ztráty)."""
    if el.tag not in INLINE:
        return False
    a = el.attr()
    if el.tag == "a":
        if set(a) - {"href"} or not re.match(r"^(\{\{link:[\w-]+\}\}(#[\w-]+)?|https?:|mailto:|tel:|#)", a.get("href", "")):
            return False
    elif el.tag == "span":
        if a and a != {"class": "todo"}:
            return False
    elif a:
        return False
    return el.tag == "br" or pure(el)


def pure(el):
    for ch in el.children:
        if ch.kind in ("ph", "comment"):
            return False
        if ch.kind == "el" and not inline_ok(ch):
            return False
    return True


def walk(src, el, marks, wraps, items=None):
    if el.kind != "el" or (el.tag != "#root" and skipped(el)):
        return
    if items is not None and el.tag in ITEM_TAGS and "data-polozka" not in el.attr():
        items.append(el)
    if "data-k" in el.attr():
        return
    bare = [c for c in el.children if c.kind == "text" and has_words(text_of(src, c))]
    elems = [c for c in el.children if c.kind == "el"]
    if el.tag != "#root" and el.tag not in VOID and not js_hook(el) and pure(el) and has_words(re.sub(r"<[^>]+>", "", text_of(src, el))):
        if not bare and len(elems) == 1 and elems[0].tag != "br":
            return walk(src, elems[0], marks, wraps, items)  # jediný potomek (odkaz v položce seznamu): označit ten
        marks.append(el)
        return
    run = []

    def flush():
        if any(c.kind == "text" and has_words(text_of(src, c)) for c in run):
            wraps.append(run[:])
        else:
            for c in run:
                walk(src, c, marks, wraps, items)

    for ch in el.children:
        if ch.kind == "text" or (ch.kind == "el" and inline_ok(ch) and not skipped(ch) and not js_hook(ch)):
            run.append(ch)
        else:
            flush()
            run = []
            walk(src, ch, marks, wraps, items)
    flush()


def process(path, name, check):
    src = path.read_text()
    root = parse(src)
    marks, wraps, items = [], [], []
    walk(src, root, marks, wraps, items)
    if check:
        return len(marks) + len(wraps) + len(items)
    used = [int(n) for n in re.findall(r'data-k="' + re.escape(name) + r':(\d+)"', src)]
    nxt = max(used, default=0) + 1
    used_p = [int(n) for n in re.findall(r'data-polozka="' + re.escape(name) + r':p(\d+)"', src)]
    nxt_p = max(used_p, default=0) + 1
    edits = []  # (pozice, vložený text)
    for el in items:
        edits.append((el.open_end - 1, f' data-polozka="{name}:p{nxt_p}"'))
        nxt_p += 1
    texts = sorted([("m", e.start, e) for e in marks] + [("w", r[0].start, r) for r in wraps], key=lambda x: x[1])
    for kind, _, obj in texts:
        key = f'{name}:{nxt}'
        nxt += 1
        if kind == "m":
            gt = obj.open_end - 1
            edits.append((gt, f' data-k="{key}"'))
        else:
            s, e = obj[0].start, obj[-1].end
            chunk = src[s:e]
            lead = len(chunk) - len(chunk.lstrip())
            trail = len(chunk) - len(chunk.rstrip())
            edits.append((s + lead, f'<span data-k="{key}">'))
            edits.append((e - trail, "</span>"))
    for pos, ins in sorted(edits, key=lambda x: x[0], reverse=True):
        src = src[:pos] + ins + src[pos:]
    path.write_text(src)
    return len(items) + len(texts)


def main():
    check = "--check" in sys.argv
    files = [(ROOT / "src/layout.html", "layout")] + [(p, p.stem) for p in sorted((ROOT / "src/pages").glob("*.html"))]
    total = 0
    for path, name in files:
        n = process(path, name, check)
        total += n
        if n:
            print(f"{path.relative_to(ROOT)}: {n} {'neoznačených' if check else 'nově označeno'}")
    print(f"celkem {total}")


if __name__ == "__main__":
    main()
