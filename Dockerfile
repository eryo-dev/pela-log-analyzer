# 1. Base Image: Python 3.9'un hafif sürümünü kullan (Debian tabanlı)
FROM python:3.9-slim

# 2. Sistem Paketleri: pgBadger Perl ile çalıştığı için Perl'ü kuruyoruz
#    Ayrıca ping ve ssh araçlarını da debug için ekliyoruz
RUN apt-get update && apt-get install -y \
    perl \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 3. Çalışma Dizini: Konteyner içindeki ana klasörümüz
WORKDIR /app

# 4. Bağımlılıklar: Önce requirements.txt'yi kopyala ve kur (Cache optimizasyonu için)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Kodları Taşı: Projedeki tüm dosyaları konteynere kopyala
COPY . .

# 6. Port: Flask'ın portunu dışarıya duyur
ENV FLASK_HOST=0.0.0.0
EXPOSE 5000

# 7. Volume: Data ve Static klasörleri için yer tutucu (Opsiyonel ama iyi pratik)
VOLUME ["/app/data", "/app/static/reports"]

# 8. Başlatma Komutu
CMD ["python", "app.py"]