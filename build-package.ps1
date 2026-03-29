param(
    [string]$OutputDir = "",
    [string]$PackageName = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectName = Split-Path -Leaf $projectRoot
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "release-packages"
}

if ([string]::IsNullOrWhiteSpace($PackageName)) {
    $PackageName = "$projectName`_$timestamp"
}

$stagingRoot = Join-Path $projectRoot ".codex-tmp\release-package"
$stagingDir = Join-Path $stagingRoot $projectName
$zipPath = Join-Path $OutputDir "$PackageName.zip"

$rootFiles = @(
    ".env.example",
    ".gitignore",
    "AGENTS.md",
    "build-package.ps1",
    "index.html",
    "package-lock.json",
    "package.json",
    "README.md",
    "requirements.txt",
    "start-dev.bat",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts"
)

$rootDirs = @(
    "api",
    "public",
    "sample_files",
    "src"
)

$excludedDirectoryNames = @(
    ".git",
    ".codex-tmp",
    "node_modules",
    "dist",
    "coverage",
    "__pycache__",
    ".pytest_cache"
)

$excludedFileNames = @(
    ".coverage"
)

$excludedPatterns = @(
    "*.db",
    "*.db-journal",
    "*.db-shm",
    "*.db-wal",
    "*.log",
    "*.pyc"
)

function Test-IsExcludedFile {
    param(
        [System.IO.FileInfo]$File
    )

    if ($excludedFileNames -contains $File.Name) {
        return $true
    }

    foreach ($pattern in $excludedPatterns) {
        if ($File.Name -like $pattern) {
            return $true
        }
    }

    foreach ($segment in $File.FullName.Split([System.IO.Path]::DirectorySeparatorChar)) {
        if ($excludedDirectoryNames -contains $segment) {
            return $true
        }
    }

    return $false
}

function Copy-ProjectFile {
    param(
        [string]$SourcePath
    )

    $projectRootWithSeparator = if ($projectRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $projectRoot
    } else {
        "$projectRoot$([System.IO.Path]::DirectorySeparatorChar)"
    }
    $projectRootUri = [System.Uri]$projectRootWithSeparator
    $sourceUri = [System.Uri]$SourcePath
    $relativePath = [System.Uri]::UnescapeDataString(
        $projectRootUri.MakeRelativeUri($sourceUri).ToString()
    ).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $destinationPath = Join-Path $stagingDir $relativePath
    $destinationDir = Split-Path -Parent $destinationPath
    if (-not (Test-Path $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $SourcePath -Destination $destinationPath -Force
}

if (Test-Path $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

foreach ($fileName in $rootFiles) {
    $fullPath = Join-Path $projectRoot $fileName
    if (Test-Path $fullPath) {
        Copy-ProjectFile -SourcePath $fullPath
    }
}

foreach ($dirName in $rootDirs) {
    $fullDir = Join-Path $projectRoot $dirName
    if (-not (Test-Path $fullDir)) {
        continue
    }

    Get-ChildItem -LiteralPath $fullDir -Recurse -File | Where-Object {
        -not (Test-IsExcludedFile -File $_)
    } | ForEach-Object {
        Copy-ProjectFile -SourcePath $_.FullName
    }
}

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "发布包已生成: $zipPath"
