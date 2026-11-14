@echo off
rem Opens index.html (GitHub Releases Explorer) as an app-style window (Edge or Chrome), or in the default browser as a fallback.
set "FILE=%~dp0index.html"
set "URL=file:///%FILE:\=/%"
set "URL=%URL: =%20%"
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do if exist %%B (
  start "" %%B --app="%URL%" --window-size=1500,860
  exit /b 0
)
start "" "%FILE%"
