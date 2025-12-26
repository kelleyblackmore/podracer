import { GoogleGenAI } from "@google/genai";
import { GameSessionStats } from "../types";

// Initialize the API client
// Ideally this would be outside the function scope to reuse the instance, 
// but we need to ensure process.env.API_KEY is available.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeRacePerformance = async (stats: GameSessionStats): Promise<string> => {
  try {
    const ai = getAI();
    const modelId = "gemini-3-flash-preview";
    
    const prompt = `
      You are an expert Race Engineer for a top-tier racing team. 
      The driver has just completed a session. Analyze their telemetry below and provide feedback.
      
      **Data:**
      - Total Laps: ${stats.totalLaps}
      - Best Lap Time: ${stats.bestLap ? stats.bestLap.toFixed(2) + 's' : 'N/A'}
      - Lap Telemetry: ${JSON.stringify(stats.telemetry.map(t => ({
        lap: t.lapNumber,
        time: t.time.toFixed(2),
        avgSpeed: Math.round(t.averageSpeed),
        collisions: t.collisions,
        offTrack: t.offTrackCount
      })))}

      **Instructions:**
      1. Analyze their consistency (lap times).
      2. Critique their safety (collisions/off-track).
      3. Give 2-3 specific, actionable tips to improve their driving line or throttle control.
      4. Adopt a professional but encouraging "Crew Chief" persona. 
      5. Keep it under 200 words.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Communication error with Crew Chief. No data received.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Crew Chief radio is down. Check your network connection or API key.";
  }
};