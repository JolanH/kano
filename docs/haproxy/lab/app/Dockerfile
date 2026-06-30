FROM python:3.12-slim
# curl lets you hit the app's /toggle, /health, /slow endpoints from inside the
# container (the slim base ships neither curl nor wget).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY server.py /server.py
ENV PORT=8080
EXPOSE 8080
CMD ["python", "/server.py"]
