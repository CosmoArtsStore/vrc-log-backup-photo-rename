# Windows: Android APK build when symlink fails.
# 1. Run "npm run android:build" until it fails at symlink.
# 2. Run this script to copy .so and run Gradle.

$ErrorActionPreference = "Stop"
$desktopRoot = Split-Path -Parent $PSScriptRoot
$srcTauri = Join-Path $desktopRoot "src-tauri"
$targetSo = Join-Path $srcTauri "target\aarch64-linux-android\release\libdesktop_lib.so"
$jniDir = Join-Path $srcTauri "gen\android\app\src\main\jniLibs\arm64-v8a"
$genAndroid = Join-Path $srcTauri "gen\android"

if (-not (Test-Path $targetSo)) {
    Write-Error "libdesktop_lib.so not found. Run npm run android:build first (let it fail at symlink)."
}

New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
Copy-Item -Path $targetSo -Destination (Join-Path $jniDir "libdesktop_lib.so") -Force
Write-Host "Copied libdesktop_lib.so to jniLibs/arm64-v8a"

# Android SDK location (ANDROID_HOME or default Android Studio path)
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath -or -not (Test-Path $sdkPath)) {
    $sdkPath = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path $sdkPath)) {
    Write-Error "Android SDK not found. Set ANDROID_HOME or install Android Studio (default: $env:LOCALAPPDATA\Android\Sdk)"
}
$localProps = Join-Path $genAndroid "local.properties"
$sdkDirValue = $sdkPath -replace '\\', '/'
# Write without BOM so Gradle can parse (PowerShell UTF8 adds BOM by default)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($localProps, "sdk.dir=$sdkDirValue`n", $utf8NoBom)
$env:ANDROID_HOME = $sdkPath
Write-Host "Using SDK: $sdkPath"

# Gradle/Kotlin do not support Java 25 yet; use Android Studio JBR (JDK 17) for Gradle
$jbrPath = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $jbrPath) {
    $env:JAVA_HOME = $jbrPath
    Write-Host "Using JAVA_HOME: $jbrPath (for Gradle)"
}

Push-Location $genAndroid
try {
    $excludeRustRelease = @(
        "-x", "rustBuildUniversalRelease",
        "-x", "rustBuildArm64Release", "-x", "rustBuildArmRelease",
        "-x", "rustBuildX86Release", "-x", "rustBuildX86_64Release"
    )
    $excludeRustDebug = @(
        "-x", "rustBuildUniversalDebug",
        "-x", "rustBuildArm64Debug", "-x", "rustBuildArmDebug",
        "-x", "rustBuildX86Debug", "-x", "rustBuildX86_64Debug"
    )
    & .\gradlew.bat assembleRelease @excludeRustRelease
    & .\gradlew.bat assembleDebug @excludeRustDebug
    Write-Host ""
    Write-Host "Release APK: $genAndroid\app\build\outputs\apk\universal\release\app-universal-release.apk"
    Write-Host "Debug APK:  $genAndroid\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
} finally {
    Pop-Location
}
