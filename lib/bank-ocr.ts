type ParsedExpense = {
  merchant: string;
  category: string;
  amount: number;
  expenseDate: string;
  note: string;
  confidence: number;
};

const ignored = /\b(balance|available|account|payment received|refund|deposit|salary|income|credit|transfer(?:red)?|opening|closing|pending total)\b/i;
const amountPattern = /(?:AUD\s*)?[$S]?\s*(-?\d{1,3}(?:[,.]\d{3})*[,.]\d{2}|-?\d+[,.]\d{2})\s*(?:AUD)?/gi;
const datePattern = /\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b|\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(\d{2,4}))?\b/i;
const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(value: string) {
  const match = value.match(datePattern);
  if (!match) return "";
  const now = new Date();
  const day = Number(match[1] || match[4]);
  const month = match[2] ? Number(match[2]) - 1 : monthNames.indexOf(match[5].slice(0, 3).toLowerCase());
  let year = Number(match[3] || match[6] || now.getFullYear());
  if (year < 100) year += 2000;
  if (!match[3] && !match[6]) {
    const candidate = new Date(year, month, day);
    if (candidate.getTime() > now.getTime() + 7 * 86400000) year -= 1;
  }
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return "";
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function categoryFor(merchant: string) {
  const value = merchant.toLowerCase();
  if (/cafe|coffee|restaurant|mcdonald|kfc|ubereats|doordash|bakery|bar\b|grill|pizza/.test(value)) return "Food & dining";
  if (/woolworth|coles|aldi|iga\b|supermarket|grocer|market/.test(value)) return "Groceries";
  if (/uber(?!eats)|taxi|fuel|petrol|shell|bp\b|caltex|ampol|parking|transit|metro|bus|train/.test(value)) return "Transport";
  if (/chemist|pharmacy|medical|health|clinic|dental/.test(value)) return "Health";
  if (/netflix|spotify|cinema|theatre|gaming|steam|ticketek/.test(value)) return "Entertainment";
  if (/hotel|airbnb|airline|qantas|jetstar|virgin|booking\.com/.test(value)) return "Travel";
  if (/electric|energy|water|telstra|optus|vodafone|internet|insurance|council/.test(value)) return "Bills & utilities";
  if (/amazon|kmart|target|big w|ebay|paypal|afterpay|shop/.test(value)) return "Shopping";
  return "Other";
}

function merchantFrom(lines: string[], index: number, amountText: string) {
  const candidates = [lines[index], lines[index - 1], lines[index + 1]].filter(Boolean);
  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(amountText, "")
      .replace(datePattern, "")
      .replace(/\b(pending|processed|purchase|debit|visa|mastercard|card)\b/gi, "")
      .replace(/[|•]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/^[-–—.,:]+|[-–—.,:]+$/g, "")
      .trim();
    if (cleaned.length >= 2 && !ignored.test(cleaned) && !/^\d+$/.test(cleaned)) return cleaned.slice(0, 80);
  }
  return "Unrecognised transaction";
}

export function parseBankText(text: string): ParsedExpense[] {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const found: ParsedExpense[] = [];
  let lastDate = "";

  lines.forEach((line, index) => {
    const nearby = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" ");
    const detectedDate = isoDate(nearby);
    if (detectedDate) lastDate = detectedDate;
    if (ignored.test(nearby)) return;

    const matches = [...line.matchAll(amountPattern)];
    for (const match of matches) {
      const raw = match[1].replace(/,(?=\d{2}$)/, ".").replace(/,(?=\d{3}(?:\D|$))/g, "");
      const amount = Math.abs(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) continue;
      const merchant = merchantFrom(lines, index, match[0]);
      const expenseDate = detectedDate || lastDate || new Date().toISOString().slice(0, 10);
      const signature = `${merchant.toLowerCase()}|${amount.toFixed(2)}|${expenseDate}`;
      if (found.some(item => `${item.merchant.toLowerCase()}|${item.amount.toFixed(2)}|${item.expenseDate}` === signature)) continue;
      found.push({ merchant, category: categoryFor(merchant), amount, expenseDate, note: "Imported from bank screenshot", confidence: detectedDate && merchant !== "Unrecognised transaction" ? 0.82 : 0.64 });
    }
  });

  return found;
}
