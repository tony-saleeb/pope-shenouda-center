export interface OcrRequestItem {
  id: string;
  url: string;
}

export interface OcrResultItem {
  id: string;
  reference_number: string | null;
  amount: number | null;
  sender_name: string | null;
  transaction_date: string | null;
  confidence: 'high' | 'low' | 'failed';
  notes: string | null;
}

export interface OcrBatchResponse {
  results: OcrResultItem[];
}

export async function processOcrBatch(registrants: OcrRequestItem[]): Promise<OcrBatchResponse> {
  const results: OcrResultItem[] = [];

  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OCR_SPACE_API_KEY in .env file');
  }

  for (const reg of registrants) {
    try {
      let imageBuffer: Buffer;

      if (reg.url.startsWith('data:')) {
        const matches = reg.url.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error('Invalid base64 string format');
        imageBuffer = Buffer.from(matches[2], 'base64');
      } else {
        // Download standard URLs to a buffer before sending to OCR Space
        const response = await fetch(reg.url);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      const formData = new FormData();
      formData.append('base64image', `data:image/jpeg;base64,${imageBuffer.toString('base64')}`);
      formData.append('language', 'eng'); // Extract English digits
      formData.append('isOverlayRequired', 'false');
      formData.append('scale', 'true'); // Auto-scale for better OCR
      formData.append('OCREngine', '2'); // Engine 2 is better for numbers/receipts

      // Call OCR.Space API
      const res = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'apikey': apiKey,
        },
        body: formData as any,
      });

      if (!res.ok) {
         throw new Error(`OCR.Space API returned HTTP ${res.status}`);
      }

      const data = await res.json();
      
      if (data.IsErroredOnProcessing) {
          throw new Error(data.ErrorMessage?.[0] || 'Unknown OCR.Space error');
      }

      let extractedText = '';
      if (data.ParsedResults && data.ParsedResults.length > 0) {
        extractedText = data.ParsedResults[0].ParsedText || '';
      }

      // Find the 12-digit InstaPay reference number using Regex
      // We look for exactly 12 consecutive digits surrounded by word boundaries
      const match = extractedText.match(/\b\d{12}\b/);
      const referenceNumber = match ? match[0] : null;

      results.push({
        id: reg.id,
        reference_number: referenceNumber,
        amount: null,
        sender_name: null,
        transaction_date: null,
        confidence: referenceNumber ? 'high' : 'low',
        notes: null,
      });
      
    } catch (err: any) {
      console.error(`OCR.Space API failed for ${reg.id}:`, err);
      results.push({
        id: reg.id,
        reference_number: null,
        amount: null,
        sender_name: null,
        transaction_date: null,
        confidence: 'failed',
        notes: err.message,
      });
    }
  }

  return { results };
}
