FROM python:3.13-slim

ARG VERSION=0.0.0

ENV APP_VERSION=${VERSION}

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY main.py ./

EXPOSE 8080

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8080"]
