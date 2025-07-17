# Setting up the app

## Start the client (client folder)

`npm install` if you haven't.
`npm start` to install dependencies.

## Start the FastAPI server (server folder)
`pip install -r requirements.txt` to install python dependencies.
`npm install` if you haven't.
`.\venv\Scripts\activate` to activate environment.
`uvicorn model_api.voice_api:app --reload` to start the FastAPI server.

## Start the backend server (server folder)
`.\venv\Scripts\activate` to activate environment if you haven't.
`npm start` to start the backend server.