# =============================================================================
# GeoAnalytics — Deploy via SSH (Windows PowerShell)
# Uso: .\deploy.ps1
#      .\deploy.ps1 -Rollback
#      .\deploy.ps1 -Force
# =============================================================================

param(
    [switch]$Rollback,
    [switch]$Force
)

# ── Configuração ───────────────────────────────────────────────────────────────
# Edite estas variáveis com os dados do seu servidor
$SERVER_USER = "ubuntu"                      # usuário SSH
$SERVER_HOST = "mineracaoanalytics.cloud"    # IP ou domínio do servidor
$SERVER_PATH = "/opt/geoanalytics"           # diretório do projeto no servidor
$SSH_KEY     = "$HOME\.ssh\id_rsa"           # chave SSH (opcional)

# ── Funções ────────────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "[deploy] $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "[ok]     $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[warn]   $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "[erro]   $msg" -ForegroundColor Red }

# ── Monta argumentos do deploy.sh ─────────────────────────────────────────────
$args_remote = ""
if ($Rollback) { $args_remote = "--rollback" }
if ($Force)    { $args_remote = "--force" }

# ── Monta comando SSH ──────────────────────────────────────────────────────────
$ssh_opts = "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
if (Test-Path $SSH_KEY) {
    $ssh_opts += " -i `"$SSH_KEY`""
}

$remote_cmd = "bash $SERVER_PATH/deploy.sh $args_remote"

Write-Step "Conectando a $SERVER_USER@$SERVER_HOST..."
Write-Step "Executando: $remote_cmd"
Write-Host ""

# ── Executa no servidor ────────────────────────────────────────────────────────
$exit_code = 0
try {
    $proc = Start-Process -FilePath "ssh" `
        -ArgumentList "$ssh_opts $SERVER_USER@$SERVER_HOST `"$remote_cmd`"" `
        -NoNewWindow -Wait -PassThru
    $exit_code = $proc.ExitCode
} catch {
    Write-Err "Falha ao conectar via SSH: $_"
    exit 1
}

if ($exit_code -eq 0) {
    Write-Host ""
    Write-Ok "Deploy concluido com sucesso!"
} else {
    Write-Host ""
    Write-Err "Deploy falhou com codigo $exit_code"
    Write-Warn "Para reverter: .\deploy.ps1 -Rollback"
    exit $exit_code
}
