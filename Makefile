# Dev server lifecycle (Vite via npm run dev)
.PHONY: start stop

start:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-start.ps1

stop:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-stop.ps1
