(function (root) {
  const ns = root.__JTC__;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, ImageRun } =
    require("docx");
  const {
    PDFDocument,
    StandardFonts,
    rgb,
  } = require("pdf-lib");

  const PLACEHOLDER_IMAGE_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Z0d8AAAAASUVORK5CYII=";

  const PLACEHOLDER_IMAGE_BYTES = dataUrlToBytes(PLACEHOLDER_IMAGE_DATA_URL);

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function normalizeMultilineText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const NOISE_LINE_PATTERNS = [
    /^chatgpt said:?$/i,
    /^generated (image|video|audio|file):/i,
    /^image generated:?/i,
  ];

  function isUiNoiseLine(line) {
    const text = String(line || "").trim();
    if (!text) return false;
    return NOISE_LINE_PATTERNS.some((pattern) => pattern.test(text));
  }

  function stripUiNoiseText(value) {
    const normalized = normalizeMultilineText(value);
    if (!normalized) return "";
    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !isUiNoiseLine(line));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function countLineBreaks(value) {
    return (String(value || "").match(/\n/g) || []).length;
  }

  function textFromNode(node, { preserveLineBreaks = false } = {}) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll(
        'button, [class*="icon"], form, textarea, nav, header, footer, script, style',
      )
      .forEach((element) => element.remove());

    const parts = [];

    function append(value) {
      const text = String(value || "");
      if (!text) return;
      const previous = parts.length > 0 ? parts[parts.length - 1] : "";
      if (
        previous &&
        !/\s$/.test(previous) &&
        !/^\s/.test(text) &&
        /[0-9A-Za-zÀ-ÖØ-öø-ÿ)\]]$/.test(previous) &&
        /^[0-9A-Za-zÀ-ÖØ-öø-ÿ(\[]/.test(text)
      ) {
        parts.push(" ");
      }
      parts.push(text);
    }

    function walk(current) {
      if (!current) return;
      if (current.nodeType === Node.TEXT_NODE) {
        append(current.textContent);
        return;
      }
      if (current.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      if (current.tagName === "BR") {
        parts.push("\n");
        return;
      }
      if (current.tagName === "IMG") {
        const alt = normalizeWhitespace(current.getAttribute("alt"));
        if (alt) {
          append(alt);
        }
        return;
      }

      const isBlock = /^(address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|thead|tfoot|tr|ul|pre)$/i.test(
        current.tagName,
      );

      if (isBlock && preserveLineBreaks && parts.length > 0 && !/\n$/.test(parts[parts.length - 1])) {
        parts.push("\n");
      }

      current.childNodes.forEach((child) => walk(child));

      if (isBlock && preserveLineBreaks) {
        parts.push("\n");
      }
    }

    walk(clone);

    const text = parts.join("");
    if (!preserveLineBreaks) {
      return normalizeWhitespace(text);
    }

    const walkedText = stripUiNoiseText(text);
    const innerText = stripUiNoiseText(clone.innerText || "");
    if (!innerText) {
      return walkedText;
    }

    if (!walkedText) {
      return innerText;
    }

    return countLineBreaks(innerText) > countLineBreaks(walkedText) ? innerText : walkedText;
  }

  function languageFromCodeNode(node) {
    const className = String(node?.className || "");
    const matches = className.match(/language-([a-z0-9+-]+)/i) || className.match(/lang-([a-z0-9+-]+)/i);
    return matches?.[1] || "";
  }

  function imageSrcFromNode(node) {
    const rawSrc = String(node?.getAttribute?.("src") || "").trim();
    if (!rawSrc) {
      return PLACEHOLDER_IMAGE_DATA_URL;
    }
    try {
      return new URL(rawSrc, root.location?.href || "https://chatgpt.com").toString();
    } catch (_) {
      return rawSrc;
    }
  }

  function isValidPng(bytes) {
    return (
      bytes instanceof Uint8Array &&
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  function isValidJpeg(bytes) {
    return (
      bytes instanceof Uint8Array &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  function dataUrlToBytes(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
    if (!match) {
      return new Uint8Array();
    }
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || "";
    if (!payload) {
      return new Uint8Array();
    }
    if (!isBase64) {
      return Uint8Array.from(unescape(payload), (char) => char.charCodeAt(0));
    }
    const binary = root.atob ? root.atob(payload) : Buffer.from(payload, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function dataUrlToRenderableBytes(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
    if (!match) {
      return {
        bytes: PLACEHOLDER_IMAGE_BYTES,
        mimeType: "image/png",
        placeholder: true,
      };
    }

    const mimeType = (match[1] || "image/png").toLowerCase();
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || "";
    let bytes = PLACEHOLDER_IMAGE_BYTES;

    if (payload) {
      try {
        if (isBase64) {
          const binary = root.atob ? root.atob(payload) : Buffer.from(payload, "base64").toString("binary");
          const decoded = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            decoded[index] = binary.charCodeAt(index);
          }
          if (mimeType.includes("png") && isValidPng(decoded)) {
            bytes = decoded;
          } else if ((mimeType.includes("jpeg") || mimeType.includes("jpg")) && isValidJpeg(decoded)) {
            bytes = decoded;
          }
        } else if (mimeType.includes("png") || mimeType.includes("jpeg") || mimeType.includes("jpg")) {
          const decoded = Uint8Array.from(unescape(payload), (char) => char.charCodeAt(0));
          if (mimeType.includes("png") && isValidPng(decoded)) {
            bytes = decoded;
          } else if ((mimeType.includes("jpeg") || mimeType.includes("jpg")) && isValidJpeg(decoded)) {
            bytes = decoded;
          }
        }
      } catch (_) {
        bytes = PLACEHOLDER_IMAGE_BYTES;
      }
    }

    return {
      bytes,
      mimeType: bytes === PLACEHOLDER_IMAGE_BYTES ? "image/png" : mimeType,
      placeholder: bytes === PLACEHOLDER_IMAGE_BYTES,
    };
  }

  async function blobToUint8Array(blob) {
    if (blob && typeof blob.arrayBuffer === "function") {
      return new Uint8Array(await blob.arrayBuffer());
    }

    if (typeof root.FileReader === "function") {
      return new Promise((resolve, reject) => {
        const reader = new root.FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result || new ArrayBuffer(0)));
        reader.onerror = () => reject(reader.error || new Error("Blob read failed"));
        reader.readAsArrayBuffer(blob);
      });
    }

    throw new Error("Blob arrayBuffer not supported");
  }

  async function resolveImageBytes(src) {
    const value = String(src || "").trim();
    if (!value || value.startsWith("data:")) {
      return dataUrlToRenderableBytes(value || PLACEHOLDER_IMAGE_DATA_URL);
    }

    try {
      if (typeof root.fetch !== "function") {
        throw new Error("fetch unavailable");
      }

      const response = await root.fetch(value, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`image fetch failed with ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();

      if (isValidPng(bytes)) {
        return {
          bytes,
          mimeType: "image/png",
          placeholder: false,
        };
      }
      if (isValidJpeg(bytes)) {
        return {
          bytes,
          mimeType: "image/jpeg",
          placeholder: false,
        };
      }
      if (contentType.includes("png") && isValidPng(bytes)) {
        return {
          bytes,
          mimeType: "image/png",
          placeholder: false,
        };
      }
      if ((contentType.includes("jpeg") || contentType.includes("jpg")) && isValidJpeg(bytes)) {
        return {
          bytes,
          mimeType: "image/jpeg",
          placeholder: false,
        };
      }
    } catch (_) {}

    return {
      bytes: PLACEHOLDER_IMAGE_BYTES,
      mimeType: "image/png",
      placeholder: true,
    };
  }

  function parseInlineImage(node) {
    return {
      type: "image",
      alt: normalizeWhitespace(node.getAttribute?.("alt")),
      src: imageSrcFromNode(node),
    };
  }

  function parseList(node) {
    const ordered = node.tagName === "OL";
    const items = Array.from(node.querySelectorAll(":scope > li")).map((item) =>
      stripUiNoiseText(textFromNode(item, { preserveLineBreaks: true })),
    );
    const cleanedItems = items.filter(Boolean);
    if (cleanedItems.length === 0) return null;
    return {
      type: "list",
      ordered,
      items: cleanedItems,
    };
  }

  function parseBlockquote(node) {
    const text = stripUiNoiseText(textFromNode(node, { preserveLineBreaks: true }));
    if (!text) return null;
    return {
      type: "quote",
      text,
    };
  }

  function parseHeading(node) {
    const text = stripUiNoiseText(textFromNode(node, { preserveLineBreaks: true }));
    if (!text) return null;
    return {
      type: "heading",
      level: Number(node.tagName.slice(1)),
      text,
    };
  }

  function parseParagraph(node) {
    const text = stripUiNoiseText(textFromNode(node, { preserveLineBreaks: true }));
    if (!text) return null;
    return {
      type: "paragraph",
      text,
    };
  }

  function parseCodeBlock(node) {
    const codeNode = node.matches?.("code") ? node : node.querySelector("code") || node;
    const text = stripUiNoiseText(
      String(codeNode.textContent || node.textContent || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
    if (!text) return null;
    return {
      type: "code",
      language: languageFromCodeNode(codeNode) || languageFromCodeNode(node),
      text,
    };
  }

  function parseFigure(node, blocks) {
    const image = node.querySelector("img");
    if (image) {
      blocks.push(parseInlineImage(image));
    }
    const caption = node.querySelector("figcaption");
    if (caption) {
      const text = stripUiNoiseText(textFromNode(caption, { preserveLineBreaks: true }));
      if (text) {
        blocks.push({ type: "paragraph", text });
      }
    }
  }

  function parseTable(node) {
    const rows = Array.from(node.querySelectorAll("tr"));
    const lines = rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
        if (cells.length === 0) {
          return stripUiNoiseText(textFromNode(row, { preserveLineBreaks: true }));
        }
        return cells
          .map((cell) => stripUiNoiseText(textFromNode(cell, { preserveLineBreaks: true })))
          .filter(Boolean)
          .join(" | ");
      })
      .filter(Boolean);
    if (lines.length === 0) return null;
    return {
      type: "paragraph",
      text: lines.join("\n"),
    };
  }

  function hasBlockChildren(node) {
    return Array.from(node?.children || []).some((child) =>
      /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|DL|DT|DD|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|SECTION|TABLE|TBODY|THEAD|TFOOT|TR|UL|PRE)$/i.test(
        child.tagName,
      ),
    );
  }

  function collectBlocksFromNode(node, blocks = []) {
    if (!node) return blocks;

    const childNodes = Array.from(node.childNodes || []);
    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = stripUiNoiseText(normalizeWhitespace(child.textContent));
        if (text) {
          blocks.push({ type: "paragraph", text });
        }
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const tagName = child.tagName;
      if (/^H[1-6]$/.test(tagName)) {
        const block = parseHeading(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "P") {
        const block = parseParagraph(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "BLOCKQUOTE") {
        const block = parseBlockquote(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "PRE") {
        const block = parseCodeBlock(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "UL" || tagName === "OL") {
        const block = parseList(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "IMG") {
        blocks.push(parseInlineImage(child));
        continue;
      }
      if (tagName === "TABLE") {
        const block = parseTable(child);
        if (block) blocks.push(block);
        continue;
      }
      if (tagName === "FIGURE") {
        parseFigure(child, blocks);
        continue;
      }
      if (tagName === "BR" || tagName === "HR") {
        continue;
      }

      if (hasBlockChildren(child)) {
        collectBlocksFromNode(child, blocks);
        continue;
      }

      const text = textFromNode(child, { preserveLineBreaks: true });
      const cleanedText = stripUiNoiseText(text);
      if (cleanedText) {
        blocks.push({ type: "paragraph", text: cleanedText });
      }
    }

    return blocks;
  }

  function renderBlocksToPlainText(blocks) {
    const parts = [];

    blocks.forEach((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
        case "quote":
          if (block.text) {
            parts.push(block.text);
          }
          break;
        case "list":
          if (block.items?.length) {
            parts.push(
              block.items
                .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`)
                .join("\n"),
            );
          }
          break;
        case "code":
          if (block.text) {
            parts.push(block.text);
          }
          break;
        case "image":
          parts.push(block.alt ? `[Image: ${block.alt}]` : "[Image]");
          break;
      }
    });

    return parts
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeMarkdownText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/`/g, "\\`")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderBlocksToMarkdown(blocks) {
    const lines = [];

    blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const level = Math.min(Math.max(block.level || 1, 1), 6);
          lines.push(`${"#".repeat(level)} ${block.text || ""}`.trimEnd());
          lines.push("");
          break;
        }
        case "paragraph":
          lines.push(block.text || "");
          lines.push("");
          break;
        case "quote":
          (block.text || "")
            .split("\n")
            .forEach((line) => lines.push(`> ${line}`.trimEnd()));
          lines.push("");
          break;
        case "list":
          (block.items || []).forEach((item, index) => {
            lines.push(`${block.ordered ? `${index + 1}.` : "-"} ${item}`);
          });
          lines.push("");
          break;
        case "code":
          lines.push("```" + (block.language || ""));
          lines.push(block.text || "");
          lines.push("```");
          lines.push("");
          break;
        case "image":
          lines.push(`![${escapeMarkdownText(block.alt || "")}](${block.src || PLACEHOLDER_IMAGE_DATA_URL})`);
          lines.push("");
          break;
      }
    });

    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  }

  function createDocxParagraphForBlock(block) {
    switch (block.type) {
      case "heading":
        return new Paragraph({
          heading: Math.min(Math.max(block.level || 1, 1), 6) <= 1
            ? HeadingLevel.HEADING_1
            : Math.min(Math.max(block.level || 1, 1), 6) === 2
              ? HeadingLevel.HEADING_2
              : Math.min(Math.max(block.level || 1, 1), 6) === 3
                ? HeadingLevel.HEADING_3
                : Math.min(Math.max(block.level || 1, 1), 6) === 4
                  ? HeadingLevel.HEADING_4
                  : Math.min(Math.max(block.level || 1, 1), 6) === 5
                    ? HeadingLevel.HEADING_5
                    : HeadingLevel.HEADING_6,
          children: [new TextRun({ text: block.text || "", bold: true })],
        });
      case "paragraph":
        return new Paragraph({
          children: [new TextRun(block.text || "")],
          spacing: { after: 120 },
        });
      case "quote":
        return new Paragraph({
          children: [new TextRun({ text: block.text || "", italics: true })],
          indent: { left: 720 },
          spacing: { after: 120 },
        });
      case "code":
        return new Paragraph({
          children: [
            new TextRun({
              text: block.text || "",
              font: "Courier New",
            }),
          ],
          spacing: { after: 120 },
        });
      default:
        return null;
    }
  }

  async function createDocxImageParagraph(block) {
    const imageBytes = (await resolveImageBytes(block.src || PLACEHOLDER_IMAGE_DATA_URL)).bytes;
    return new Paragraph({
      children: [
        new ImageRun({
          data: imageBytes,
          transformation: {
            width: 360,
            height: 240,
          },
        }),
      ],
      spacing: { after: 120 },
    });
  }

  async function renderDocx(payload) {
    const children = [];

    children.push(
      new Paragraph({
        text: "ChronoChat Export",
        heading: HeadingLevel.TITLE,
      }),
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Conversation ID: ${payload.conversationId}` })],
      }),
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Exported At: ${payload.exportedAt}` })],
      }),
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Message Count: ${payload.messageCount}` })],
      }),
    );

    for (const message of payload.messages) {
      children.push(
        new Paragraph({
          text: `${message.index}. ${message.role}`,
          heading: HeadingLevel.HEADING_2,
        }),
      );
      for (const block of message.blocks || []) {
        if (block.type === "image") {
          children.push(await createDocxImageParagraph(block));
          continue;
        }
        if (block.type === "list" && Array.isArray(block.items)) {
          block.items.forEach((item) => {
            children.push(
              new Paragraph({
                bullet: block.ordered
                  ? undefined
                  : {
                      level: 0,
                    },
                numbering: block.ordered
                  ? {
                      reference: "chronochat-numbering",
                      level: 0,
                    }
                  : undefined,
                children: [new TextRun(item)],
                spacing: { after: 60 },
              }),
            );
          });
          children.push(new Paragraph({ text: "", spacing: { after: 60 } }));
          continue;
        }
        const paragraph = createDocxParagraphForBlock(block);
        if (paragraph) {
          children.push(paragraph);
        }
      }
    }

    const doc = new Document({
      numbering: {
        config: [
          {
            reference: "chronochat-numbering",
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: "%1.",
                alignment: AlignmentType.START,
              },
            ],
          },
        ],
      },
      sections: [
        {
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    return blobToUint8Array(blob);
  }

  async function renderPdf(payload) {
    const pdf = await PDFDocument.create();
    const pageSize = [595.28, 841.89];
    const margin = 54;
    let page = pdf.addPage(pageSize);
    const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdf.embedFont(StandardFonts.Courier);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    let y = pageHeight - margin;

    function ensurePage(requiredHeight = 24) {
      if (y - requiredHeight < margin) {
        page = pdf.addPage(pageSize);
        y = pageHeight - margin;
      }
    }

    function headingStyle(level) {
      const safeLevel = Math.min(Math.max(Number(level) || 1, 1), 6);
      if (safeLevel === 1) {
        return { size: 20, lineGap: 4.2, before: 12, after: 9, color: rgb(0.04, 0.04, 0.04) };
      }
      if (safeLevel === 2) {
        return { size: 17, lineGap: 4, before: 10, after: 8, color: rgb(0.07, 0.07, 0.07) };
      }
      if (safeLevel === 3) {
        return { size: 14.5, lineGap: 3.5, before: 9, after: 7, color: rgb(0.1, 0.1, 0.1) };
      }
      if (safeLevel === 4) {
        return { size: 13, lineGap: 3.2, before: 8, after: 6, color: rgb(0.12, 0.12, 0.12) };
      }
      if (safeLevel === 5) {
        return { size: 12, lineGap: 3, before: 7, after: 5, color: rgb(0.15, 0.15, 0.15) };
      }
      return { size: 11.2, lineGap: 2.8, before: 6, after: 5, color: rgb(0.18, 0.18, 0.18) };
    }

    function sanitizePdfText(value, font = fontRegular, size = 11) {
      const mapped = String(value || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/→/g, "->")
        .replace(/←/g, "<-")
        .replace(/↔/g, "<->")
        .replace(/⇒/g, "=>")
        .replace(/•/g, "*");

      try {
        font.widthOfTextAtSize(mapped || " ", size);
        return mapped;
      } catch (_) {
        return mapped
          .split("")
          .map((char) => {
            if (!char || char === "\n") return char;
            try {
              font.widthOfTextAtSize(char, size);
              return char;
            } catch (_) {
              return "?";
            }
          })
          .join("");
      }
    }

    function drawWrappedText(
      text,
      {
        font = fontRegular,
        size = 11,
        color = rgb(0.1, 0.1, 0.1),
        lineGap = 4,
        indent = 0,
        before = 0,
        after = 4,
      } = {},
    ) {
      y -= before;
      const maxWidth = pageWidth - margin * 2 - indent;
      const lines = wrapText(sanitizePdfText(text, font, size), font, size, maxWidth);
      const height = lines.length * (size + lineGap);
      ensurePage(height + after + 8);
      lines.forEach((line) => {
        page.drawText(line, {
          x: margin + indent,
          y,
          size,
          font,
          color,
        });
        y -= size + lineGap;
      });
      y -= after;
    }

    function roleHeaderStyle(role) {
      const normalized = String(role || "").toLowerCase();
      if (normalized === "user") {
        return {
          badge: "YOU",
          fill: rgb(0.92, 0.96, 1),
          border: rgb(0.73, 0.82, 0.95),
          accent: rgb(0.2, 0.42, 0.78),
          text: rgb(0.08, 0.2, 0.4),
        };
      }
      if (normalized === "assistant") {
        return {
          badge: "AI",
          fill: rgb(0.93, 0.98, 0.94),
          border: rgb(0.74, 0.88, 0.76),
          accent: rgb(0.2, 0.56, 0.28),
          text: rgb(0.06, 0.26, 0.11),
        };
      }
      return {
        badge: "SYSTEM",
        fill: rgb(0.95, 0.95, 0.95),
        border: rgb(0.82, 0.82, 0.82),
        accent: rgb(0.45, 0.45, 0.45),
        text: rgb(0.16, 0.16, 0.16),
      };
    }

    function drawRoleHeader(message) {
      const roleStyle = roleHeaderStyle(message.role);
      const title = `${message.index}. ${message.role}`;
      const safe = sanitizePdfText(title, fontBold, 12);
      const lines = wrapText(safe, fontBold, 12, pageWidth - margin * 2 - 18);
      const blockHeight = lines.length * 15 + 10;
      ensurePage(blockHeight + 10);
      page.drawRectangle({
        x: margin - 2,
        y: y - blockHeight + 4,
        width: pageWidth - margin * 2 + 4,
        height: blockHeight,
        color: roleStyle.fill,
        borderColor: roleStyle.border,
        borderWidth: 1,
      });
      page.drawRectangle({
        x: margin - 2,
        y: y - blockHeight + 4,
        width: 4,
        height: blockHeight,
        color: roleStyle.accent,
      });
      page.drawText(roleStyle.badge, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: roleStyle.accent,
      });
      y -= 12;
      lines.forEach((line) => {
        page.drawText(line, {
          x: margin + 10,
          y,
          size: 12,
          font: fontBold,
          color: roleStyle.text,
        });
        y -= 15;
      });
      y -= 8;
    }

    function drawQuoteBlock(text) {
      const safe = sanitizePdfText(text, fontRegular, 11);
      const lines = wrapText(safe, fontRegular, 11, pageWidth - margin * 2 - 24);
      const blockHeight = lines.length * 15 + 8;
      ensurePage(blockHeight + 10);
      page.drawRectangle({
        x: margin + 8,
        y: y - blockHeight + 4,
        width: 2.5,
        height: blockHeight,
        color: rgb(0.65, 0.65, 0.65),
      });
      lines.forEach((line) => {
        page.drawText(line, {
          x: margin + 16,
          y,
          size: 11,
          font: fontRegular,
          color: rgb(0.22, 0.22, 0.22),
        });
        y -= 15;
      });
      y -= 6;
    }

    function parseLabeledHeadingLine(line) {
      const text = String(line || "").trim();
      if (!text) return null;
      const markdownHeading = text.match(/^(#{1,6})\s+(.+)$/);
      if (markdownHeading) {
        return {
          level: markdownHeading[1].length,
          text: markdownHeading[2].trim(),
          consumeNext: false,
        };
      }
      const labeledWithText = text.match(
        /^(titolo|title|capitolo|chapter|sezione|section|sottotitolo|subtitle|subheading)\s*:\s*(.+)$/i,
      );
      if (labeledWithText) {
        const label = labeledWithText[1].toLowerCase();
        const level = /^(sottotitolo|subtitle|subheading)$/.test(label) ? 3 : 2;
        return {
          level,
          text: labeledWithText[2].trim(),
          consumeNext: false,
        };
      }
      const labelOnly = text.match(
        /^(titolo|title|capitolo|chapter|sezione|section|sottotitolo|subtitle|subheading)\s*:\s*$/i,
      );
      if (labelOnly) {
        const label = labelOnly[1].toLowerCase();
        return {
          level: /^(sottotitolo|subtitle|subheading)$/.test(label) ? 3 : 2,
          text: "",
          consumeNext: true,
        };
      }
      return null;
    }

    function parseSectionHeadingLine(line) {
      const text = String(line || "").trim();
      if (!text) return null;

      if (/^fase\s+\d+\s*[-:]/i.test(text)) {
        return { level: 2, text, consumeNext: false };
      }
      if (/^slide\s+\d+\s*[-:]/i.test(text)) {
        return { level: 2, text, consumeNext: false };
      }
      if (/^blocco\s+\d+\s*[-:]/i.test(text)) {
        return { level: 4, text, consumeNext: false };
      }
      if (/^mese\s+\d+/i.test(text) || /^mesi\s+\d+/i.test(text)) {
        return { level: 5, text, consumeNext: false };
      }
      if (
        /^(testo slide|come metterla|titolo possibile|contenuto|sottotitolo|struttura fissa|regola testo|regola grafica|ordine ideale nel deck|chiusura breve in basso|governance e kpi)\s*:?\s*$/i.test(
          text,
        )
      ) {
        return {
          level: 4,
          text: text.replace(/:\s*$/, ""),
          consumeNext: false,
        };
      }
      if (text.length <= 48 && /^[^.!?]+:\s*$/.test(text)) {
        return {
          level: 5,
          text: text.replace(/:\s*$/, ""),
          consumeNext: false,
        };
      }
      return null;
    }

    function parseSemanticHeadingLine(line) {
      const labelHeading = parseLabeledHeadingLine(line);
      if (labelHeading) return labelHeading;
      return parseSectionHeadingLine(line);
    }

    function inferStructuredParagraphBlocks(text) {
      const raw = normalizeMultilineText(text);
      if (!raw) return [];
      const lines = raw.split("\n");
      const inferred = [];
      let paragraphLines = [];
      let index = 0;

      function pushParagraph() {
        const joined = paragraphLines.join("\n").trim();
        if (joined) {
          inferred.push({
            type: "paragraph",
            text: joined,
          });
        }
        paragraphLines = [];
      }

      while (index < lines.length) {
        const originalLine = lines[index];
        const line = String(originalLine || "");
        const trimmed = line.trim();

        if (!trimmed) {
          pushParagraph();
          index += 1;
          continue;
        }

        const heading = parseSemanticHeadingLine(trimmed);
        if (heading) {
          pushParagraph();
          if (heading.consumeNext) {
            let nextIndex = index + 1;
            while (nextIndex < lines.length && !String(lines[nextIndex] || "").trim()) {
              nextIndex += 1;
            }
            if (nextIndex < lines.length) {
              inferred.push({
                type: "heading",
                level: heading.level,
                text: String(lines[nextIndex] || "").trim(),
              });
              index = nextIndex + 1;
              continue;
            }
          } else if (heading.text) {
            inferred.push({
              type: "heading",
              level: heading.level,
              text: heading.text,
            });
            index += 1;
            continue;
          }
        }

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
          pushParagraph();
          const items = [];
          while (index < lines.length) {
            const current = String(lines[index] || "").trim();
            const currentMatch = current.match(/^[-*+]\s+(.+)$/);
            if (!currentMatch) break;
            items.push(currentMatch[1].trim());
            index += 1;
          }
          if (items.length) {
            inferred.push({ type: "list", ordered: false, items });
            continue;
          }
        }

        const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (orderedMatch) {
          pushParagraph();
          const items = [];
          while (index < lines.length) {
            const current = String(lines[index] || "").trim();
            const currentMatch = current.match(/^\d+[.)]\s+(.+)$/);
            if (!currentMatch) break;
            items.push(currentMatch[1].trim());
            index += 1;
          }
          if (items.length) {
            inferred.push({ type: "list", ordered: true, items });
            continue;
          }
        }

        const quoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (quoteMatch) {
          pushParagraph();
          const quoteLines = [];
          while (index < lines.length) {
            const current = String(lines[index] || "").trim();
            const currentMatch = current.match(/^>\s?(.*)$/);
            if (!currentMatch) break;
            quoteLines.push(currentMatch[1]);
            index += 1;
          }
          inferred.push({
            type: "quote",
            text: quoteLines.join("\n").trim(),
          });
          continue;
        }

        paragraphLines.push(trimmed);
        index += 1;
      }

      pushParagraph();
      return inferred.length
        ? inferred
        : [
            {
              type: "paragraph",
              text: raw,
            },
          ];
    }

    function resolvePdfBlocksForMessage(blocks) {
      const resolved = [];
      for (let index = 0; index < (blocks || []).length; index += 1) {
        const block = blocks[index];
        if (!block || block.type !== "paragraph") {
          resolved.push(block);
          continue;
        }

        const paragraphText = normalizeMultilineText(block.text || "");
        if (!paragraphText) continue;
        const singleLine = !paragraphText.includes("\n");
        const semanticHeading = singleLine
          ? parseSemanticHeadingLine(paragraphText)
          : null;

        if (semanticHeading?.consumeNext) {
          const nextBlock = blocks[index + 1];
          if (nextBlock?.type === "paragraph") {
            const nextText = normalizeMultilineText(nextBlock.text || "");
            if (nextText) {
              resolved.push({
                type: "heading",
                level: semanticHeading.level,
                text: nextText,
              });
              index += 1;
              continue;
            }
          }
          continue;
        }

        if (semanticHeading?.text) {
          resolved.push({
            type: "heading",
            level: semanticHeading.level,
            text: semanticHeading.text,
          });
          continue;
        }

        resolved.push({
          ...block,
          text: paragraphText,
        });
      }
      return resolved;
    }

    function drawHeadingBlock(text, level) {
      const style = headingStyle(level);
      drawWrappedText(text || "", {
        font: fontBold,
        size: style.size,
        color: style.color,
        lineGap: style.lineGap,
        before: style.before,
        after: style.after,
      });
    }

    function drawListBlock(block) {
      (block.items || []).forEach((item, index) => {
        drawWrappedText(`${block.ordered ? `${index + 1}.` : "-"} ${item}`, {
          font: fontRegular,
          size: 10.7,
          lineGap: 4.5,
          indent: 14,
          after: 4,
        });
      });
      y -= 3;
    }

    function drawBlock(block) {
      switch (block.type) {
        case "heading":
          drawHeadingBlock(block.text || "", block.level);
          break;

        case "paragraph": {
          const inferredBlocks = inferStructuredParagraphBlocks(block.text || "");
          inferredBlocks.forEach((inferred) => {
            if (inferred.type === "heading") {
              drawHeadingBlock(inferred.text || "", inferred.level);
              return;
            }
            if (inferred.type === "quote") {
              drawQuoteBlock(inferred.text || "");
              return;
            }
            if (inferred.type === "list") {
              drawListBlock(inferred);
              return;
            }
            drawWrappedText(inferred.text || "", {
              font: fontRegular,
              size: 10.7,
              lineGap: 5,
              after: 7,
            });
          });
          if (inferredBlocks.length === 0) {
            drawWrappedText(block.text || "", {
              font: fontRegular,
              size: 10.7,
              lineGap: 5,
              after: 7,
            });
          }
          break;
        }

        case "quote":
          drawQuoteBlock(block.text || "");
          break;

        case "code": {
          const codeLines = String(block.text || "").split("\n");
          const wrappedLines = codeLines.flatMap((line) =>
            wrapText(
              sanitizePdfText(line || " ", fontMono, 9),
              fontMono,
              9,
              pageWidth - margin * 2 - 12,
            ).map((wrapped) => wrapped || " "),
          );
          ensurePage((wrappedLines.length || 1) * 12 + 16);
          page.drawRectangle({
            x: margin - 4,
            y: y - (wrappedLines.length * 12 + 12),
            width: pageWidth - margin * 2 + 8,
            height: wrappedLines.length * 12 + 12,
            color: rgb(0.96, 0.96, 0.96),
            borderColor: rgb(0.84, 0.84, 0.84),
            borderWidth: 1,
          });
          wrappedLines.forEach((line) => {
            page.drawText(line, {
              x: margin + 2,
              y,
              size: 9,
              font: fontMono,
              color: rgb(0.12, 0.12, 0.12),
            });
            y -= 12;
          });
          y -= 8;
          break;
        }

        case "list":
          drawListBlock(block);
          break;

        case "image":
          drawImageBlock(block);
          break;
      }
    }

    async function drawImageBlock(block) {
      const resolved = await resolveImageBytes(block.src || PLACEHOLDER_IMAGE_DATA_URL);
      let image;
      try {
        if (resolved.mimeType.includes("jpeg") || resolved.mimeType.includes("jpg")) {
          image = await pdf.embedJpg(resolved.bytes);
        } else {
          image = await pdf.embedPng(resolved.bytes);
        }
      } catch (_) {
        image = await pdf.embedPng(PLACEHOLDER_IMAGE_BYTES);
      }

      const maxWidth = pageWidth - margin * 2;
      const scale = Math.min(maxWidth / image.width, 240 / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      ensurePage(height + 16);
      page.drawImage(image, {
        x: margin,
        y: y - height,
        width,
        height,
      });
      y -= height + 12;
    }

    drawWrappedText("ChronoChat Export", {
      font: fontBold,
      size: 18,
      color: rgb(0.03, 0.03, 0.03),
      after: 8,
    });
    drawWrappedText(`Conversation ID: ${payload.conversationId}`, { after: 2 });
    drawWrappedText(`Exported At: ${payload.exportedAt}`, { after: 2 });
    drawWrappedText(`Message Count: ${payload.messageCount}`, { after: 10 });

    for (const message of payload.messages) {
      drawRoleHeader(message);
      const resolvedBlocks = resolvePdfBlocksForMessage(message.blocks || []);
      for (const block of resolvedBlocks) {
        await drawBlock(block);
      }
      y -= 6;
    }

    return pdf.save();
  }

  function wrapText(text, font, size, maxWidth) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    const rawLines = normalized.split("\n");
    const lines = [];

    rawLines.forEach((rawLine) => {
      const words = rawLine.split(/\s+/).filter((part) => part.length > 0);
      if (words.length === 0) {
        lines.push("");
        return;
      }
      let current = "";
      words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) {
          current = next;
        } else {
          lines.push(current);
          current = word;
        }
      });
      if (current) {
        lines.push(current);
      }
    });

    return lines.length > 0 ? lines : [""];
  }

  function buildMessageDocument(message, fallbackText = "") {
    const blocks = collectBlocksFromNode(message.domNode).filter(Boolean);
    const fallback = stripUiNoiseText(message.fullText || message.preview || fallbackText || "");
    const content = renderBlocksToPlainText(blocks) || fallback;
    return {
      index: message.index,
      role: message.role,
      content,
      blocks,
    };
  }

  ns.exporters = {
    PLACEHOLDER_IMAGE_DATA_URL,
    PLACEHOLDER_IMAGE_BYTES,
    buildMessageDocument,
    collectBlocksFromNode,
    dataUrlToRenderableBytes,
    resolveImageBytes,
    renderBlocksToMarkdown,
    renderBlocksToPlainText,
    renderDocx,
    renderPdf,
  };
})(globalThis);
