; Build with scripts/build-installer.ps1. No downloads or global runtime installs.
#if Ver < 0x06070300
  #error Inno Setup 6.7.3 or newer is required
#endif
#pragma message "Correctly compiler version: " + Str(Ver)
#ifndef MyAppVersion
  #define MyAppVersion "3.1.0"
#endif
#ifndef MyOutputBase
  #define MyOutputBase "Correctly-V3.1-Setup"
#endif
#ifndef BundleDir
  #define BundleDir "..\artifacts\v3.1\Correctly-V3-Windows-x64"
#endif
#ifndef ReleaseDir
  #define ReleaseDir "..\artifacts\release"
#endif
#ifndef TestMode
  #define TestMode "0"
#endif
#if TestMode == "1"
  #define ProductId "{{19751EA6-761D-45B0-A263-3E79767863EB}"
  #define StartupIcon "{app}\test-startup\Correctly"
  #define ProgramsDir "{app}\test-start-menu"
#else
  #define ProductId "{{B71B62DD-5F7A-4BB9-9411-7A046DC8CE9D}"
  #define StartupIcon "{userstartup}\Correctly"
  #define ProgramsDir "{userprograms}\Correctly"
#endif
#define StartupLink StartupIcon + ".lnk"

[Setup]
AppId={#ProductId}
AppName=Correctly
AppVersion={#MyAppVersion}
AppVerName=Correctly {#MyAppVersion}
AppPublisher=Correctly project
DefaultDirName={localappdata}\Programs\Correctly
DefaultGroupName=Correctly
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
UsePreviousTasks=yes
CloseApplications=no
RestartApplications=no
OutputDir={#ReleaseDir}
OutputBaseFilename={#MyOutputBase}
#if TestMode == "1"
Compression=zip
#else
Compression=lzma2/normal
#endif
SolidCompression=yes
DiskSpanning=no
WizardStyle=modern
SetupIconFile=..\backend\assets\correctly.ico
UninstallDisplayIcon={app}\CorrectlyServer.exe
UninstallDisplayName=Correctly
VersionInfoVersion={#MyAppVersion}
InfoAfterFile=AFTER_INSTALL.txt
SetupLogging=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Démarrer Correctly à l'ouverture de session / Start Correctly when I sign in"

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "INSTALL_EXTENSION.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#CompilerPath}\LICENSE.TXT"; DestDir: "{app}\licenses"; DestName: "InnoSetup-LICENSE.txt"; Flags: ignoreversion

[Icons]
Name: "{#ProgramsDir}\Correctly"; Filename: "{app}\CorrectlyServer.exe"; WorkingDir: "{app}"
Name: "{#ProgramsDir}\Installer l'extension"; Filename: "{app}\INSTALL_EXTENSION.html"
Name: "{#ProgramsDir}\Désinstaller Correctly"; Filename: "{uninstallexe}"
; Removed only after verifying both its marker and target, including on uninstall.
Name: "{#StartupIcon}"; Filename: "{app}\CorrectlyServer.exe"; WorkingDir: "{app}"; Comment: "Correctly V3 managed startup shortcut"; Tasks: autostart; Flags: runminimized uninsneveruninstall

[Run]
Filename: "{app}\CorrectlyServer.exe"; Description: "Lancer Correctly / Start Correctly"; Flags: nowait postinstall skipifsilent runasoriginaluser
Filename: "{app}\INSTALL_EXTENSION.html"; Description: "Voir comment installer l'extension Chrome/Brave"; Flags: shellexec postinstall skipifsilent unchecked

[Code]
const
  StartupMarker = 'Correctly V3 managed startup shortcut';
var
  TasksInitialized: Boolean;

function OwnedShortcut(const Link: String): Boolean;
var
  Shell, Shortcut: Variant;
begin
  Result := False;
  if not FileExists(Link) then exit;
  try
    Shell := CreateOleObject('WScript.Shell');
    Shortcut := Shell.CreateShortcut(Link);
    Result := (Shortcut.Description = StartupMarker) and
      (CompareText(Shortcut.TargetPath, ExpandConstant('{app}\CorrectlyServer.exe')) = 0);
  except
    Result := False;
  end;
end;

function RemoveOwnedShortcut(const Link: String): Boolean;
begin
  Result := True;
  if OwnedShortcut(Link) then Result := DeleteFile(Link);
end;

function StopInstalledCopy: Boolean;
var
  Exe: String;
  Code: Integer;
begin
  Exe := ExpandConstant('{app}\CorrectlyServer.exe');
  Result := True;
  if not FileExists(Exe) then exit;
  Result := Exec(Exe, '--shutdown', ExpandConstant('{app}'), SW_HIDE,
    ewWaitUntilTerminated, Code);
  if Result then Result := Code = 0;
end;

function TasksSpecified: Boolean;
var
  I: Integer;
  Argument: String;
begin
  Result := False;
  for I := 1 to ParamCount do begin
    Argument := Uppercase(ParamStr(I));
    if (Pos('/TASKS=', Argument) = 1) or (Pos('/MERGETASKS=', Argument) = 1) then
      Result := True;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpSelectTasks) and not TasksInitialized then begin
    TasksInitialized := True;
    // Reflect changes made from the tray since the previous setup run.
    if FileExists(ExpandConstant('{app}\CorrectlyServer.exe')) and not TasksSpecified then begin
      if OwnedShortcut(ExpandConstant('{#StartupLink}')) then
        WizardSelectTasks('autostart')
      else
        WizardSelectTasks('');
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Link: String;
begin
  Result := '';
  Link := ExpandConstant('{#StartupLink}');
  if FileExists(Link) and not OwnedShortcut(Link) then begin
    Result := 'Un raccourci Correctly d''une autre installation existe. Désactivez son démarrage automatique depuis cette installation avant de continuer. Aucun raccourci tiers ne sera remplacé.';
    exit;
  end;
#if TestMode != "1"
  Link := ExpandConstant('{userstartup}\CorrectlyServer-V3.lnk');
  if WizardIsTaskSelected('autostart') and FileExists(Link) and not OwnedShortcut(Link) then begin
    Result := 'Une ancienne installation Correctly démarre avec Windows. Désactivez cette option dans son menu avant de continuer, pour éviter deux lanceurs.';
    exit;
  end;
#endif
  if not StopInstalledCopy then
    Result := 'Correctly ne s''est pas arrêté. Quittez le serveur depuis son icône, puis réessayez. Aucun autre processus Java ne sera arrêté.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    if not WizardIsTaskSelected('autostart') then
      if not RemoveOwnedShortcut(ExpandConstant('{#StartupLink}')) then
        RaiseException('Impossible de retirer le raccourci de démarrage Correctly.');
#if TestMode != "1"
    if not RemoveOwnedShortcut(ExpandConstant('{userstartup}\CorrectlyServer-V3.lnk')) then
      RaiseException('Impossible de retirer l''ancien raccourci Correctly géré.');
#endif
  end;
end;

function InitializeUninstall: Boolean;
begin
  // Shutdown occurs after confirmation, before any file deletion.
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    if not StopInstalledCopy then
      RaiseException('Quittez Correctly depuis son icône puis relancez la désinstallation. Aucun processus tiers ne sera arrêté.');
    if not RemoveOwnedShortcut(ExpandConstant('{#StartupLink}')) then
      RaiseException('Impossible de retirer le raccourci de démarrage Correctly.');
  end;
end;
