Set-Location -LiteralPath "$PSScriptRoot\backend"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $javaHome) {
    $env:JAVA_HOME = $javaHome
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}
.\mvnw.cmd spring-boot:run
