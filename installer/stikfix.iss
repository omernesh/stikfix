; Stikfix Windows installer (Inno Setup 6, Pascal Script)
; Version is injected by the build orchestrator: ISCC /DAppVersion=<v> installer\stikfix.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define ExtId "ccdfmbhdcafhmnnnfjpbhgebfkfgjgca"
#define UpdateUrl "https://github.com/omernesh/stikfix/releases/latest/download/update.xml"

[Setup]
AppId={{8F3A6C21-4B7E-4E2A-9D1F-2C5B7A9E3D64}
AppName=Stikfix
AppVerName=Stikfix {#AppVersion}
AppVersion={#AppVersion}
AppPublisher=Omer Nesher
DefaultDirName={autopf}\Stikfix
DisableProgramGroupPage=yes
PrivilegesRequired=admin
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=..\public\icon\stikfix.ico
UninstallDisplayIcon={app}\stikfix-host.exe
OutputDir=..\dist\installer
OutputBaseFilename=stikfix-setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes

[Types]
Name: "full";   Description: "Complete installation (recommended)"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "host";        Description: "Stikfix host (required)";      Types: full custom; Flags: fixed
Name: "ext";         Description: "Browser extension (auto-install)"; Types: full custom
Name: "ext\chrome";  Description: "Google Chrome";                Types: full custom
Name: "ext\edge";    Description: "Microsoft Edge";               Types: full custom
Name: "ext\brave";   Description: "Brave";                        Types: full custom

[Tasks]
Name: "startup";     Description: "Run the Stikfix host automatically when I sign in to Windows"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "Create a desktop shortcut";    GroupDescription: "Shortcuts:"

[Files]
Source: "..\dist\sea\stikfix-host.exe"; DestDir: "{app}"; Components: host; Flags: ignoreversion
Source: "..\dist\crx\stikfix.crx";      DestDir: "{app}"; Components: ext;  Flags: ignoreversion
Source: "..\public\icon\stikfix.ico";   DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Stikfix Host";         Filename: "{sys}\wscript.exe"; Parameters: "//B //Nologo ""{%USERPROFILE}\.local\share\stikfix\stikfix-host.vbs"""; IconFilename: "{app}\stikfix.ico"
Name: "{group}\Stikfix Health Check"; Filename: "{cmd}"; Parameters: "/k ""{app}\stikfix-host.exe"" doctor"; IconFilename: "{app}\stikfix.ico"
Name: "{group}\Uninstall Stikfix";    Filename: "{uninstallexe}"
Name: "{autodesktop}\Stikfix Host";   Filename: "{sys}\wscript.exe"; Parameters: "//B //Nologo ""{%USERPROFILE}\.local\share\stikfix\stikfix-host.vbs"""; IconFilename: "{app}\stikfix.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\stikfix-host.exe"; Parameters: "register --root ""{code:GetNotesRoot}"" --host-exe ""{app}\stikfix-host.exe"" {code:StartupArg}"; Flags: runhidden waituntilterminated; StatusMsg: "Registering Stikfix host..."; Components: host

[UninstallRun]
Filename: "{app}\stikfix-host.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "StikfixTeardown"

[Code]
var
  NotesPage: TInputDirWizardPage;
  VerifyPage: TOutputMsgMemoWizardPage;
  ComponentDefaultsApplied: Boolean;

function ExeExistsIn(const Base, SubPath: String): Boolean;
begin
  Result := (Base <> '') and FileExists(AddBackslash(Base) + SubPath);
end;

{ Run the doctor health check and surface its output on the Verification page. }
procedure RunDoctorIntoMemo();
var
  TmpFile: String;
  Output: AnsiString;
  ResultCode: Integer;
begin
  TmpFile := ExpandConstant('{tmp}\stikfix-doctor.txt');
  if Exec(ExpandConstant('{cmd}'),
       '/c ""' + ExpandConstant('{app}\stikfix-host.exe') + '"" doctor > ""' + TmpFile + '"" 2>&1',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringFromFile(TmpFile, Output) then
      VerifyPage.RichEditViewer.Text := 'Post-install health check:' + #13#10 + #13#10 + Output
    else
      VerifyPage.RichEditViewer.Text := 'Post-install health check:' + #13#10 + #13#10
        + '(The health check ran but its output could not be read.)';
  end
  else
    VerifyPage.RichEditViewer.Text := 'Post-install health check:' + #13#10 + #13#10
      + 'Could not launch the Stikfix host for verification.' + #13#10
      + 'You can run it manually later from the Start Menu (Stikfix Health Check).';
end;

function ChromeInstalled(): Boolean;
begin
  Result := ExeExistsIn(ExpandConstant('{pf}'), 'Google\Chrome\Application\chrome.exe')
    or ExeExistsIn(ExpandConstant('{pf32}'), 'Google\Chrome\Application\chrome.exe')
    or ExeExistsIn(ExpandConstant('{localappdata}'), 'Google\Chrome\Application\chrome.exe');
end;

function EdgeInstalled(): Boolean;
begin
  Result := ExeExistsIn(ExpandConstant('{pf}'), 'Microsoft\Edge\Application\msedge.exe')
    or ExeExistsIn(ExpandConstant('{pf32}'), 'Microsoft\Edge\Application\msedge.exe')
    or ExeExistsIn(ExpandConstant('{localappdata}'), 'Microsoft\Edge\Application\msedge.exe');
end;

function BraveInstalled(): Boolean;
begin
  Result := ExeExistsIn(ExpandConstant('{pf}'), 'BraveSoftware\Brave-Browser\Application\brave.exe')
    or ExeExistsIn(ExpandConstant('{pf32}'), 'BraveSoftware\Brave-Browser\Application\brave.exe')
    or ExeExistsIn(ExpandConstant('{localappdata}'), 'BraveSoftware\Brave-Browser\Application\brave.exe');
end;

procedure InitializeWizard();
begin
  NotesPage := CreateInputDirPage(
    wpSelectTasks,
    'Notes folder',
    'Where should captured notes be written?',
    'Stikfix writes each note as a markdown file into this folder. Choose a location, then click Next.',
    False,
    '');
  NotesPage.Add('');
  NotesPage.Values[0] := ExpandConstant('{userdocs}\stikfix-notes');

  VerifyPage := CreateOutputMsgMemoPage(
    wpInstalling,
    'Verification',
    'Post-install health check',
    'Stikfix ran a health check after installation. Review the results below, then click Next to finish.',
    '');
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Sel: String;
begin
  { First time the components page shows, pre-select ext sub-components only for
    installed browsers (uncheck absent ones). '*' resets all selections first;
    the fixed 'host' component stays selected regardless. Guarded so a user's
    manual edits are respected if they navigate back to this page. }
  if (CurPageID = wpSelectComponents) and (not ComponentDefaultsApplied) then
  begin
    Sel := '*host';
    if ChromeInstalled() then Sel := Sel + ',ext\chrome';
    if EdgeInstalled() then Sel := Sel + ',ext\edge';
    if BraveInstalled() then Sel := Sel + ',ext\brave';
    WizardSelectComponents(Sel);
    ComponentDefaultsApplied := True;
  end;

  { When the Verification page appears (after install + host registration), run doctor. }
  if (VerifyPage <> nil) and (CurPageID = VerifyPage.ID) then
    RunDoctorIntoMemo();
end;

function GetNotesRoot(Value: String): String;
begin
  Result := NotesPage.Values[0];
end;

function StartupArg(Value: String): String;
begin
  if WizardIsTaskSelected('startup') then
    Result := '--startup'
  else
    Result := '--no-startup';
end;

{ Write the force-install policy value without clobbering unrelated entries. }
procedure WriteForcelistPolicy(RootKey: Integer; const SubKey: String);
var
  Names: TArrayOfString;
  I, N, MaxN, Code: Integer;
  ExistingData, NamePrefix, NewData: String;
begin
  NamePrefix := '{#ExtId}' + ';';
  NewData := '{#ExtId}' + ';' + '{#UpdateUrl}';

  { Ensure the key exists. }
  if not RegKeyExists(RootKey, SubKey) then
  begin
    if not RegWriteStringValue(RootKey, SubKey, '', '') then
      Exit;
    { Remove the placeholder default value we just created (best-effort). }
    RegDeleteValue(RootKey, SubKey, '');
  end;

  MaxN := 0;
  if RegGetValueNames(RootKey, SubKey, Names) then
  begin
    for I := 0 to GetArrayLength(Names) - 1 do
    begin
      if RegQueryStringValue(RootKey, SubKey, Names[I], ExistingData) then
      begin
        { Idempotent: our extension is already force-listed. }
        if (Length(ExistingData) >= Length(NamePrefix))
          and (Copy(ExistingData, 1, Length(NamePrefix)) = NamePrefix) then
          Exit;
      end;
      { Track the max integer-named value. }
      Code := StrToIntDef(Names[I], -1);
      if Code > MaxN then
        MaxN := Code;
    end;
  end;

  N := MaxN + 1;
  RegWriteStringValue(RootKey, SubKey, IntToStr(N), NewData);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if WizardIsComponentSelected('ext\chrome') and ChromeInstalled() then
      WriteForcelistPolicy(HKLM, 'Software\Policies\Google\Chrome\ExtensionInstallForcelist');
    if WizardIsComponentSelected('ext\edge') and EdgeInstalled() then
      WriteForcelistPolicy(HKLM, 'Software\Policies\Microsoft\Edge\ExtensionInstallForcelist');
    if WizardIsComponentSelected('ext\brave') and BraveInstalled() then
      WriteForcelistPolicy(HKLM, 'Software\Policies\BraveSoftware\Brave\ExtensionInstallForcelist');
  end;
end;

{ ---- Uninstall: remove ONLY our force-install policy values ---- }
procedure RemoveOurForcelistPolicy(RootKey: Integer; const SubKey: String);
var
  Names: TArrayOfString;
  I: Integer;
  ExistingData, NamePrefix: String;
begin
  NamePrefix := '{#ExtId}' + ';';
  if not RegKeyExists(RootKey, SubKey) then
    Exit;
  if RegGetValueNames(RootKey, SubKey, Names) then
  begin
    for I := 0 to GetArrayLength(Names) - 1 do
    begin
      if RegQueryStringValue(RootKey, SubKey, Names[I], ExistingData) then
      begin
        if (Length(ExistingData) >= Length(NamePrefix))
          and (Copy(ExistingData, 1, Length(NamePrefix)) = NamePrefix) then
          RegDeleteValue(RootKey, SubKey, Names[I]);
      end;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    RemoveOurForcelistPolicy(HKLM, 'Software\Policies\Google\Chrome\ExtensionInstallForcelist');
    RemoveOurForcelistPolicy(HKLM, 'Software\Policies\Microsoft\Edge\ExtensionInstallForcelist');
    RemoveOurForcelistPolicy(HKLM, 'Software\Policies\BraveSoftware\Brave\ExtensionInstallForcelist');
  end;
end;
