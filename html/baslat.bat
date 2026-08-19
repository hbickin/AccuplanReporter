@echo off
chcp 65001 > nul
cd /d "%~dp0"

where node > nul 2> nul
if errorlevel 1 (
  echo.
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurun,
  echo sonra bu dosyayi yeniden calistirin.
  echo.
  echo Kurulum yapmadan kullanmak icin: public\index.html dosyasini cift tiklayin
  echo ve is emri XML dosyasini yukleyin.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Bagimliliklar kuruluyor...
  call npm install || goto :hata
)

if not exist .env (
  echo .env bulunamadi, .env.example kopyalaniyor. Veritabani bilgilerini doldurun.
  copy .env.example .env > nul
)

start "" http://localhost:3000
call npm start
goto :son

:hata
echo.
echo Kurulum basarisiz oldu.
pause

:son
