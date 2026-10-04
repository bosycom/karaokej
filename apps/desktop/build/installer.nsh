; Karaokej NSIS customizations (included by electron-builder).
; Included in the NSIS header before installer.nsi — LogicLib is not loaded yet.
!include LogicLib.nsh

!macro karaokejFindMainAppProcess RESULT
  ; 0 = process running, 1 = not running (tasklist exit code inverted for nsExec)
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""'
  Pop ${RESULT}
  ${If} ${RESULT} == 0
    StrCpy ${RESULT} 0
  ${Else}
    StrCpy ${RESULT} 1
  ${EndIf}
!macroend

!macro karaokejKillMainApp
  System::Call 'kernel32::GetCurrentProcessId() i.r8'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $R8"'
!macroend

!macro karaokejPreserveDataAndRemoveInstallDir
  StrCpy $R8 "0"
  ${If} ${FileExists} "$INSTDIR\data"
    ClearErrors
    Rename "$INSTDIR\data" "$PLUGINSDIR\karaokej_data_bak"
    ${IfNot} ${Errors}
      StrCpy $R8 "1"
    ${Else}
      DetailPrint "Note: could not move data folder aside; continuing overwrite."
    ${EndIf}
  ${EndIf}
  RMDir /r "$INSTDIR"
  CreateDirectory "$INSTDIR"
  ${If} $R8 == "1"
    Rename "$PLUGINSDIR\karaokej_data_bak" "$INSTDIR\data"
  ${EndIf}
!macroend

!macro customInit
  ; Broken prior installs may register an uninstaller path that no longer exists.
  StrCpy $R1 "$INSTDIR\Uninstall Karaokej.exe"
  ${IfNot} ${FileExists} "$R1"
    ReadRegStr $R2 SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" UninstallString
    ${If} $R2 != ""
      DetailPrint "Registered uninstaller is missing; clearing stale upgrade metadata."
      DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
      !ifdef UNINSTALL_REGISTRY_KEY_2
        DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
      !endif
    ${EndIf}
  ${EndIf}
!macroend

; Default electron-builder check matches ANY process under $INSTDIR via PowerShell (false positives).
!macro customCheckAppRunning
  !insertmacro karaokejFindMainAppProcess $R0
  ${If} $R0 == 0
    ${If} ${isUpdated}
      Sleep 500
      !insertmacro karaokejFindMainAppProcess $R0
      ${If} $R0 != 0
        Goto karaokej_app_check_done
      ${EndIf}
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK karaokejKillRunning
    Quit

    karaokejKillRunning:
    DetailPrint "$(appClosing)"
    !insertmacro karaokejKillMainApp
    Sleep 1000
    !insertmacro karaokejFindMainAppProcess $R0
    ${If} $R0 == 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY karaokejKillRunning
      Quit
    ${EndIf}
  ${EndIf}
  karaokej_app_check_done:
!macroend

; electron-builder upgrade uninstall moves all of $INSTDIR aside, then RMDir /r — data/ would be lost.
!macro customRemoveFiles
  ${If} ${isUpdated}
    ${If} ${FileExists} "$INSTDIR\data"
      ClearErrors
      Rename "$INSTDIR\data" "$PLUGINSDIR\karaokej_data_preserve"
      ${If} ${Errors}
        DetailPrint "Warning: could not move data folder aside during upgrade."
      ${EndIf}
    ${EndIf}

    CreateDirectory "$PLUGINSDIR\old-install"
    Push ""
    Call un.atomicRMDir
    Pop $R0

    ${If} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"
      Push ""
      Call un.restoreFiles
      Pop $R0
      ${If} ${FileExists} "$PLUGINSDIR\karaokej_data_preserve"
        Rename "$PLUGINSDIR\karaokej_data_preserve" "$INSTDIR\data"
      ${EndIf}
      Abort "Can't rename $INSTDIR to $PLUGINSDIR\old-install."
    ${EndIf}

    SetOutPath $TEMP
    RMDir /r $INSTDIR
    CreateDirectory "$INSTDIR"

    ${If} ${FileExists} "$PLUGINSDIR\karaokej_data_preserve"
      Rename "$PLUGINSDIR\karaokej_data_preserve" "$INSTDIR\data"
    ${EndIf}
  ${Else}
    SetOutPath $TEMP
    RMDir /r $INSTDIR
  ${EndIf}
!macroend

!macro customUnInstallCheck
  ${If} $R0 != 0
    DetailPrint "Previous uninstaller exited with code $R0; forcing clean overwrite."
    !insertmacro karaokejKillMainApp
    Sleep 1000
    !insertmacro karaokejPreserveDataAndRemoveInstallDir
  ${EndIf}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

!macro customInstall
  ${IfNot} ${FileExists} "$INSTDIR\demucs-runtime\python.exe"
    IfFileExists "$INSTDIR\resources\demucs-runtime.zip" 0 demucsSkip
    ${GetSize} "$INSTDIR\resources\demucs-runtime.zip" "/S=0K" $0 $1 $2
    IntCmp $0 1000000 0 demucsSkip demucsSkip
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Install Demucs for AI vocal removal?$\n$\nThis adds about 2 GB (CPU-only). Works offline after install. You can skip and use the app without AI vocal removal." IDNO demucsSkip
    DetailPrint "Extracting Demucs runtime (this may take a few minutes)..."
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$zip = ''$INSTDIR\resources\demucs-runtime.zip''; $$staging = ''$INSTDIR\demucs-runtime-staging''; $$target = ''$INSTDIR\demucs-runtime''; Expand-Archive -LiteralPath $$zip -DestinationPath $$staging -Force; & (Join-Path $$staging ''install.ps1'') -TargetDir $$target; Remove-Item -Recurse -Force $$staging"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Demucs installation failed (exit $0). You can reinstall later from a new setup package."
    ${EndIf}
  demucsSkip:
  ${EndIf}
!macroend
