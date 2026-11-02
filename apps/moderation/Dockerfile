FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models HF_HUB_DISABLE_TELEMETRY=1
RUN useradd --create-home --uid 10001 app && mkdir /models && chown app /models
WORKDIR /srv
# CPU-only torch: the GPU build is several gigabytes larger and the VPS has no GPU.
RUN pip install --no-cache-dir torch==2.8.* --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
USER app
EXPOSE 8010
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
