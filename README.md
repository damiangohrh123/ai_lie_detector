# AI Lie Detector

AI Lie Detector is an experimental AI multimodal system that analyzes face, voice and text signals to predict a truthfulness score and highlight important moments. It consists of a React frontend and a FastAPI backend that provides analysis APIs and WebSocket endpoints for live audio processing.

Key Features
- Real-time facial emotion analysis via webcam using face-api.js.
  ![Facial Emotion Detection](assets/1.png)
- Real-time speech emotion recognition with Wav2Vec2.0 and WebRTC VAD.
  ![Speech Emotion Detection](assets/2.png)
- Text-based deception detection using DistilBERT on live transcripts
  ![Text-based Deception Detection](assets/3.png)
- Multimodal fusion to output an aggregated deception likelihood score.
  ![Multimodal Fusion](assets/4.png)
- Live and recorded modes: supports webcam/live streaming and uploaded video/audio analysis.
  ![File Upload analysis](assets/5.png)
- WebSocket audio pipeline: low-latency audio streaming to the backend for continuous voice/text analysis.
- Exportable session summaries: create a PDF session summary with timeline, thumbnail and top moments.

Architecture
- `client/` — React app (uses the build in `client/build` for production). Key components:
	- `AudioProcessor` — handles audio capture, WebSocket connection and transcript buffering.
	- `FaceExpressionDetector` — processes webcam frames for face emotion probabilities.
	- `FusionTruthfulness` — sends aggregated modality data to the fusion API and displays the score.
- `server/` — FastAPI application exposing REST APIs and a `/ws/audio` WebSocket endpoint for streaming audio.
	- Endpoints: `/api/text-sentiment`, `/api/voice-sentiment` (via WS), `/api/fusion-truthfulness`, `/api/export-summary`.

Quick Start (local development)
1. Backend (server)
	 - Create and activate a Python virtual environment and install deps:
		 ```cmd
		 cd server
		 python -m venv venv
		 .\venv\Scripts\activate
		 pip install -r requirements.txt
		 ```
	 - Start the FastAPI server:
		 ```cmd
		 uvicorn main:app --reload
		 ```

2. Frontend (client)
	 - Install and run the React dev server:
		 ```cmd
		 cd client
		 npm install
		 npm start
		 ```
	 - The frontend is hosted on Vercel. You can skip the frontend setup and click on this link instead: https://ai-lie-detector-kohl.vercel.app/.

Video Demo
