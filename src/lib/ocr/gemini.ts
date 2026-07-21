import type { OcrExtractionResult } from '@/lib/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Send an image buffer to Gemini Vision API and extract structured InstaPay receipt details.
 *
 * @param imageBuffer The image as an ArrayBuffer or Buffer
 * @param mimeType    The image content type (e.g. image/jpeg, image/png)
 */
export async function extractReceiptData(
  imageBuffer: ArrayBuffer | Buffer,
  mimeType: string
): Promise<OcrExtractionResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const base64Data = Buffer.from(new Uint8Array(imageBuffer)).toString('base64');

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `You are analyzing an InstaPay (Egyptian peer-to-peer bank transfer) payment confirmation screenshot. The image may be a direct app screenshot or a photo taken of a phone's screen (which might have glare, moire patterns, skew, or blur).

Please extract the following information and return a JSON object matching this schema:
{
  "reference_number": "the InstaPay reference/transaction number (usually a long number, e.g., 10-12 digits) as a string, or null if unreadable",
  "amount": the numeric amount in EGP (just the number, e.g. 150, no currency symbols), or null if unreadable,
  "sender_name": "the sender's name as shown on the receipt, or null if unreadable",
  "transaction_date": "the date of transaction, or null if unreadable",
  "confidence": "high" if you can clearly read BOTH the reference number and the amount, "low" if they are blurry/partially unreadable, "failed" if this is not a payment confirmation screenshot at all,
  "notes": "any brief observations about the screenshot quality"
}

Ensure the output is valid JSON. Return ONLY the JSON object.`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Empty response from Gemini API');
    }

    // Parse extracted JSON
    try {
      const parsed: OcrExtractionResult = JSON.parse(textResponse.trim());
      return {
        reference_number: parsed.reference_number || null,
        amount: parsed.amount != null ? Number(parsed.amount) : null,
        sender_name: parsed.sender_name || null,
        transaction_date: parsed.transaction_date || null,
        confidence: parsed.confidence || 'failed',
        notes: parsed.notes || '',
      };
    } catch (parseErr) {
      console.error('Failed to parse JSON response from Gemini:', textResponse);
      throw new Error('Gemini output was not valid JSON');
    }
  } catch (error) {
    console.error('Gemini Vision API request failed:', error);
    return {
      reference_number: null,
      amount: null,
      sender_name: null,
      transaction_date: null,
      confidence: 'failed',
      notes: `API Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
