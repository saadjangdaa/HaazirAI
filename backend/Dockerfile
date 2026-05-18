FROM python:3.11-slim
WORKDIR /haazir
COPY requirements.txt backend/
COPY . backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
ENV PYTHONPATH=/haazir
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
