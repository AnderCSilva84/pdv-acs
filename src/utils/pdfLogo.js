import logoGelato from '../assets/gelatoimg.jpeg';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageFormat(dataUrl) {
  const mime = String(dataUrl).match(/^data:image\/([^;,]+)/i)?.[1]?.toLowerCase();
  if (mime === "png") return "PNG";
  if (mime === "webp") return "WEBP";
  return "JPEG";
}

export async function getPdfLogo(logomarca) {
  const source = String(logomarca || "").trim();
  if (!source) return null;

  const dataUrl = source.startsWith("data:")
    ? source
    : await fetch(source).then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel carregar a logomarca.");
        return blobToDataUrl(await response.blob());
      });

  return { dataUrl, format: getImageFormat(dataUrl) };
}

let pdvLogoPromise;

export async function addPdvPdfBranding(doc, { showLogo = true } = {}) {
  pdvLogoPromise ||= getPdfLogo('/branding/pdv-acs-install-icon.png').catch((error) => {
    pdvLogoPromise = null;
    throw error;
  });
  const logo = await pdvLogoPromise;
  const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    if (showLogo) {
      doc.addImage(logo.dataUrl, logo.format, 14, height - 11, 8, 8);
      doc.link(14, height - 11, 8, 8, { url: 'https://acstech.dev.br/' });
    }
    doc.setFontSize(8);
    doc.setTextColor(96, 112, 134);
    if (showLogo) doc.text('PDV ACS', 24, height - 6);
    doc.text('Desenvolvido por Anderson C Silva | ACS Tecnologia', width / 2, height - 6, { align: 'center' });
  }
  doc.setPage(currentPage);
}

export async function addPdfHeader(doc, { loja, title, lines = [] }) {
  const width = doc.internal.pageSize.getWidth();
  const drawLogo = (logo, x) => {
    if (!logo) return;
    const image = doc.getImageProperties(logo.dataUrl);
    const scale = Math.min(28 / image.width, 28 / image.height);
    const w = image.width * scale, h = image.height * scale;
    doc.addImage(logo.dataUrl, logo.format, x + (28 - w) / 2, 10 + (28 - h) / 2, w, h);
  };
  const [storeLogo, pdvLogo] = await Promise.all([
    getPdfLogo(loja?.logomarca || (loja?.id === 'gelato-local' ? logoGelato : '')).catch(() => null),
    getPdfLogo('/branding/pdv-acs-install-icon.png'),
  ]);
  drawLogo(storeLogo, 14);
  drawLogo(pdvLogo, width - 42);
  doc.link(width - 42, 10, 28, 28, { url: 'https://acstech.dev.br/' });
  doc.setTextColor(24, 33, 47);
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(title, width - 96);
  doc.text(titleLines, width / 2, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(96, 112, 134);
  let y = 18 + titleLines.length * 7;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, width - 96);
    doc.text(wrapped, width / 2, y, { align: 'center' });
    y += wrapped.length * 5;
  }
  return Math.max(46, y + 7);
}

export function addCashClosingHeader(doc, { loja, operadora, data }) {
  return addPdfHeader(doc, {
    loja, title: 'Fechamento diario de caixa',
    lines: [`Operadora: ${operadora || 'Nao informada'}`, `Data: ${data}`],
  });
}
