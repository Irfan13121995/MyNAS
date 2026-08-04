[Setup]
AppName=Personal NAS
AppVersion=1.0.0
AppPublisher=Irfan
AppPublisherURL=https://github.com/Irfan13121995/MyNAS
AppSupportURL=https://github.com/Irfan13121995/MyNAS/issues
DefaultDirName={autopf}\Personal NAS
DefaultGroupName=Personal NAS
OutputDir=Output
OutputBaseFilename=PersonalNAS_Installer
SetupIconFile=assets\logo.ico
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallMode=x64compatible
MinVersion=10.0.19041
UninstallDisplayIcon={app}\assets\logo.ico
DisableProgramGroupPage=yes
WizardStyle=modern
WizardSizePercent=120
LicenseFile=
; Uncomment above and point to a LICENSE.txt if you want a license page

; ─────────────────────────────────────────────────────────────────────────────
; FILES
; ─────────────────────────────────────────────────────────────────────────────
[Files]
; Server application (node_modules included from npm ci --omit=dev)
Source: "server\*"; DestDir: "{app}\server"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: ".env,nas_data.db,nas_data.db-shm,nas_data.db-wal,dist\*,.nas_cache\*,temp_uploads\*"
; NSSM service manager
Source: "tools\nssm.exe"; DestDir: "{app}\tools"; Flags: ignoreversion
; PowerShell helper scripts
Source: "scripts\install-service.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall-service.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
; Application icon
Source: "assets\logo.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

; ─────────────────────────────────────────────────────────────────────────────
; INTERNET SHORTCUT (.url file for browser launch)
; ─────────────────────────────────────────────────────────────────────────────
[INI]
Filename: "{app}\PersonalNAS_Dashboard.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:GetServerPort}"
Filename: "{app}\PersonalNAS_Dashboard.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"
Filename: "{app}\PersonalNAS_Dashboard.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\assets\logo.ico"

; ─────────────────────────────────────────────────────────────────────────────
; SHORTCUTS
; ─────────────────────────────────────────────────────────────────────────────
[Icons]
Name: "{commondesktop}\Personal NAS Dashboard"; Filename: "{app}\PersonalNAS_Dashboard.url"; IconFilename: "{app}\assets\logo.ico"
Name: "{group}\Personal NAS Dashboard"; Filename: "{app}\PersonalNAS_Dashboard.url"; IconFilename: "{app}\assets\logo.ico"
Name: "{group}\View Install Log"; Filename: "notepad.exe"; Parameters: "{app}\install.log"
Name: "{group}\Uninstall Personal NAS"; Filename: "{uninstallexe}"

; ─────────────────────────────────────────────────────────────────────────────
; POST-INSTALL: Run service installer PowerShell script
; ─────────────────────────────────────────────────────────────────────────────
[Run]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-service.ps1"" -InstallDir ""{app}"" -Port ""{code:GetServerPort}"" -StoragePath ""{code:GetStoragePath}"" -TunnelToken ""{code:GetTunnelToken}"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Configuring Personal NAS service..."
; Offer to launch dashboard after install
Filename: "{app}\PersonalNAS_Dashboard.url"; \
  Description: "Launch Personal NAS Dashboard"; \
  Flags: postinstall nowait shellexec skipifsilent unchecked

; ─────────────────────────────────────────────────────────────────────────────
; PRE-UNINSTALL: Run service cleanup PowerShell script
; ─────────────────────────────────────────────────────────────────────────────
[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-service.ps1"" -InstallDir ""{app}"""; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "RemoveNASService"

; ─────────────────────────────────────────────────────────────────────────────
; CLEANUP
; ─────────────────────────────────────────────────────────────────────────────
[UninstallDelete]
Type: files; Name: "{app}\PersonalNAS_Dashboard.url"
Type: files; Name: "{app}\install.log"
Type: files; Name: "{app}\uninstall.log"

; ─────────────────────────────────────────────────────────────────────────────
; PASCAL SCRIPT — Custom wizard pages, Node.js auto-install, helper functions
; ─────────────────────────────────────────────────────────────────────────────
[Code]

var
  ServerPage: TInputQueryWizardPage;
  StoragePage: TInputDirWizardPage;
  TunnelPage: TInputQueryWizardPage;
  SummaryPage: TOutputMsgMemoWizardPage;

{ Win32 API: download a file from URL }
function URLDownloadToFile(pCaller: Cardinal; URL, FileName: String; Reserved: Cardinal; StatusCB: Cardinal): Cardinal;
  external 'URLDownloadToFileW@urlmon.dll stdcall';

{ Win32 API: set environment variable in current process }
function SetEnvironmentVariable(lpName, lpValue: String): BOOL;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

{ ─── Create Custom Wizard Pages ─── }
procedure InitializeWizard;
begin
  { Page 1: Server Configuration }
  ServerPage := CreateInputQueryPage(wpSelectDir,
    'Server Configuration',
    'Configure the network port for the web dashboard.',
    'Specify the TCP port on which the Personal NAS dashboard will listen.' + #13#10 +
    'Default: 3000. Only change if port 3000 is already in use.');
  ServerPage.Add('Server Port:', False);
  ServerPage.Values[0] := '3000';

  { Page 2: Storage Directory }
  StoragePage := CreateInputDirPage(ServerPage.ID,
    'Storage Configuration',
    'Choose the default NAS storage location.',
    'This directory will be used for mobile device backups and file storage.' + #13#10 +
    'You can change this later from the Settings page.',
    False, '');
  StoragePage.Add('NAS Storage Directory:');
  StoragePage.Values[0] := 'C:\PersonalNAS_Storage';

  { Page 3: Cloudflare Tunnel (Optional) }
  TunnelPage := CreateInputQueryPage(StoragePage.ID,
    'Cloudflare Tunnel (Optional)',
    'Configure remote access via Cloudflare.',
    'If you have a Cloudflare permanent tunnel token, enter it below.' + #13#10 +
    'This enables secure remote access via your custom domain (e.g., mynas-hi.eu.org).' + #13#10 + #13#10 +
    'Leave blank to skip. You can configure this later from the dashboard.');
  TunnelPage.Add('Cloudflare Tunnel Token:', False);
  TunnelPage.Values[0] := '';

  { Page 4: Summary }
  SummaryPage := CreateOutputMsgMemoPage(TunnelPage.ID,
    'Setup Summary',
    'Review your configuration before installing.',
    'The following settings will be applied. Click Back to make changes, or Install to proceed.',
    '');
end;

{ ─── Validate port input is numeric and in valid range ─── }
function IsValidPort(PortStr: String): Boolean;
var
  PortNum: Integer;
begin
  Result := False;
  PortNum := StrToIntDef(PortStr, -1);
  if (PortNum >= 1) and (PortNum <= 65535) then
    Result := True;
end;

{ ─── NextButtonClick: Validate inputs & populate summary ─── }
function NextButtonClick(CurPageID: Integer): Boolean;
var
  SummaryText: String;
begin
  Result := True;

  { Validate Server Port }
  if CurPageID = ServerPage.ID then
  begin
    if not IsValidPort(ServerPage.Values[0]) then
    begin
      MsgBox('Please enter a valid port number (1-65535).', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  { Validate Storage Path }
  if CurPageID = StoragePage.ID then
  begin
    if Trim(StoragePage.Values[0]) = '' then
    begin
      MsgBox('Please specify a storage directory.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  { Populate summary page when leaving Tunnel page }
  if CurPageID = TunnelPage.ID then
  begin
    SummaryText :=
      'Install Directory:' + #13#10 +
      '    ' + WizardDirValue + #13#10#13#10 +
      'Server Port:' + #13#10 +
      '    ' + ServerPage.Values[0] + #13#10#13#10 +
      'Storage Directory:' + #13#10 +
      '    ' + StoragePage.Values[0] + #13#10#13#10;

    if Trim(TunnelPage.Values[0]) <> '' then
      SummaryText := SummaryText +
        'Cloudflare Tunnel:' + #13#10 +
        '    Configured (token provided)' + #13#10
    else
      SummaryText := SummaryText +
        'Cloudflare Tunnel:' + #13#10 +
        '    Not configured (skip)' + #13#10;

    SummaryText := SummaryText + #13#10 +
      'Services to be created:' + #13#10 +
      '    PersonalNAS_Server (Windows Service, auto-start)' + #13#10#13#10 +
      'Firewall rules to be created:' + #13#10 +
      '    PersonalNAS_HTTP_' + ServerPage.Values[0] + ' (TCP inbound)' + #13#10 +
      '    PersonalNAS_mDNS (UDP 5353 inbound)' + #13#10;

    SummaryPage.RichEditViewer.Lines.Text := SummaryText;
  end;
end;

{ ─── Getter functions for [Run] section {code:...} constants ─── }
function GetServerPort(Param: String): String;
begin
  Result := ServerPage.Values[0];
end;

function GetStoragePath(Param: String): String;
begin
  Result := StoragePage.Values[0];
end;

function GetTunnelToken(Param: String): String;
begin
  Result := TunnelPage.Values[0];
end;

{ ─── Download Node.js using Win32 URLDownloadToFile ─── }
function DownloadNodeJS(Url, DestFile: String): Boolean;
var
  Res: Cardinal;
begin
  WizardForm.StatusLabel.Caption := 'Downloading Node.js v24 LTS (this may take a minute)...';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  try
    Res := URLDownloadToFile(0, Url, DestFile, 0, 0);
    Result := (Res = 0);
  finally
    WizardForm.ProgressGauge.Style := npbstNormal;
  end;
end;

{ ─── Refresh PATH from registry so newly installed Node is visible ─── }
procedure RefreshEnvironmentPath;
var
  MachinePath, UserPath: String;
begin
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', MachinePath) then
  begin
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', UserPath) then
      SetEnvironmentVariable('PATH', MachinePath + ';' + UserPath)
    else
      SetEnvironmentVariable('PATH', MachinePath);
  end;
end;

{ ─── CurStepChanged: Auto-install Node.js if missing ─── }
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NodeInstalled: Boolean;
  NodeMsiPath: String;
begin
  if CurStep = ssInstall then
  begin
    NodeInstalled := False;

    { Check if node is available and returns exit code 0 }
    if Exec('cmd.exe', '/c node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
        NodeInstalled := True;
    end;

    if not NodeInstalled then
    begin
      if MsgBox(
        'Node.js v24 LTS is required but was not found on this system.' + #13#10#13#10 +
        'Would you like the installer to download and install it automatically?' + #13#10 +
        '(~35 MB download, requires internet connection)',
        mbConfirmation, MB_YESNO) = IDYES then
      begin
        NodeMsiPath := ExpandConstant('{tmp}\node-v24.18.0-x64.msi');

        if DownloadNodeJS('https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi', NodeMsiPath) then
        begin
          WizardForm.StatusLabel.Caption := 'Installing Node.js v24 LTS...';
          WizardForm.ProgressGauge.Style := npbstMarquee;

          if Exec('msiexec.exe',
            '/i "' + NodeMsiPath + '" /qn ADDLOCAL=ALL',
            '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
          begin
            if ResultCode = 0 then
            begin
              RefreshEnvironmentPath;
              Log('Node.js installed successfully.');
            end
            else
              MsgBox('Node.js MSI returned error code: ' + IntToStr(ResultCode) + '.' + #13#10 +
                'Installation will continue, but you may need to install Node.js manually.',
                mbError, MB_OK);
          end
          else
            MsgBox('Failed to launch Node.js MSI installer.' + #13#10 +
              'Please install Node.js v24+ manually after setup completes.',
              mbError, MB_OK);

          WizardForm.ProgressGauge.Style := npbstNormal;
        end
        else
          MsgBox('Failed to download Node.js.' + #13#10 +
            'Please install Node.js v24+ manually after setup completes.',
            mbError, MB_OK);
      end
      else
        MsgBox('Node.js is required for Personal NAS to function.' + #13#10 +
          'Please install Node.js v24+ manually before starting the service.',
          mbInformation, MB_OK);
    end;
  end;
end;
