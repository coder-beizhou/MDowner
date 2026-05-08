!macro customInstall
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe" "FriendlyAppName" "MDowner"
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe\DefaultIcon" "" "$INSTDIR\MDowner.exe,0"
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe\shell\open\command" "" '"$INSTDIR\MDowner.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe\SupportedTypes" ".markdown" ""
  WriteRegStr HKCU "Software\Classes\Applications\MDowner.exe\SupportedTypes" ".txt" ""
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\MDowner.exe"
!macroend
