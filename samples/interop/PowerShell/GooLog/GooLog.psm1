using namespace System
using namespace System.Management.Automation
using namespace Goo
using namespace Goo.Widgets
using namespace Goo.Widgets.Actions
using namespace Goo.Widgets.Inputs
using namespace Goo.Widgets.Layout
using namespace Goo.Widgets.Data

$ErrorActionPreference = 'Stop'

class LogRows : Goo.Cell[string[]] {
    hidden [Func[string, string]] $RowKey = { param($line) return $line }
    hidden [Func[string, Goo.Blob]] $RowBuilder

    LogRows() {
        $theme = [Theme]::GitHubDark
        $this.RowBuilder = {
            param($line)
            return [Text]@{ Content = $line; Padding = $theme.Spacing; Color = $theme.TextColor }
        }.GetNewClosure()
    }

    [Goo.Blob] Build([string[]] $lines) {
        $list = [VirtualLists]::Rows[string]($lines, 32, $this.RowKey, $this.RowBuilder, $false, $null, $null)
        $list.FlexGrow = 1
        $list.MinHeight = 0
        $list.Scrollbar = [Theme]::GitHubDark.Scrollbar
        $list.ScrollbarVisibilityY = [ScrollbarVisibility]::Always
        return $list
    }
}

class LogView : Goo.Cell {
    [string] $Message = 'Ready to collect log entries'
    [string[]] $Lines = @('0000  Ready')
    hidden [int] $NextId = 1
    [bool] $DialogOpen
    [string] $Status = 'Ready'
    hidden [Theme] $Colors = [Theme]::GitHubDark
    hidden [ElementHandle] $InputHandle = [ElementHandle]::new()
    hidden [Job] $Job
    hidden [WindowTimer] $PollTimer
    hidden [Action[string]] $ChangeMessage
    hidden [Action[string]] $SubmitMessage
    hidden [Action] $AppendMessage
    hidden [Action] $CollectLogs
    hidden [Action] $OpenDialog
    hidden [Action] $CloseDialog
    hidden [Action] $ClearLogs
    hidden [Action[bool]] $ChangeDialog
    hidden [Action] $PollJob
    hidden [KeyBinding[]] $Bindings

    LogView() {
        $self = $this
        $this.ChangeMessage = { param($value) $self.Message = $value }.GetNewClosure()
        $this.AppendMessage = { $self.AddLine($self.Message) }.GetNewClosure()
        $this.SubmitMessage = { param($value) $self.AddLine($value) }.GetNewClosure()
        $this.CollectLogs = { $self.StartCollection() }.GetNewClosure()
        $this.OpenDialog = { $self.DialogOpen = $true }.GetNewClosure()
        $this.CloseDialog = { $self.DialogOpen = $false }.GetNewClosure()
        $this.ClearLogs = { $self.Lines = @(); $self.DialogOpen = $false }.GetNewClosure()
        $this.ChangeDialog = { param($value) $self.DialogOpen = $value }.GetNewClosure()
        $this.PollJob = { $self.ReceiveCollection() }.GetNewClosure()
        $this.Bindings = [KeyBinding[]]@(
            [KeyBinding]@{ Key = 'L'; Modifiers = [KeyModifiers]::Primary; OnPress = { $null = $self.InputHandle.Focus() }.GetNewClosure() }
        )
    }

    [void] AddLine([string] $message) {
        if ([string]::IsNullOrWhiteSpace($message)) { return }
        $this.Lines = @($this.Lines | Select-Object -Last 499) + ('{0:D4}  {1}' -f $this.NextId++, $message)
        $this.Message = ''
    }

    [void] StartCollection() {
        if ($null -ne $this.Job) { return }
        $this.Status = 'Collecting in a ThreadJob'
        $this.Job = Start-ThreadJob -ArgumentList $this.Lifetime -ScriptBlock {
            param($cancellation)
            $ErrorActionPreference = 'Stop'
            foreach ($number in 1..120) {
                if ($cancellation.IsCancellationRequested) { return }
                '{0:D4}  Background log entry {0}' -f $number
            }
        }
        $this.PollTimer = $this.Every(100, $this.PollJob)
    }

    [void] ReceiveCollection() {
        if ($this.Job.State -notin @('Completed', 'Failed', 'Stopped')) { return }
        $completedJob = $this.Job
        $this.Job = $null
        $this.PollTimer.Dispose()
        $this.PollTimer = $null
        try {
            $receivedLines = [string[]]@(Receive-Job -Job $completedJob -ErrorAction Stop)
            $self = $this
            $apply = [Action]{ $self.Lines = $receivedLines; $self.NextId = $receivedLines.Count + 1; $self.Status = "Received $($receivedLines.Count) background entries" }.GetNewClosure()
            if (-not $this.Post($apply)) { throw 'The log view is no longer mounted' }
        } catch {
            $this.Status = $_.Exception.Message
        } finally {
            Remove-Job -Job $completedJob -Force
        }
    }

    [void] Unmounting() {
        if ($null -ne $this.PollTimer) { $this.PollTimer.Dispose() }
    }

    [Goo.Blob] Build() {
        $theme = $this.Colors
        $root = [Container]@{
            BasedOn = $theme.CanvasStyle
            Width = [Length]::Percent(100)
            Height = [Length]::Percent(100)
            MinWidth = 0
            MinHeight = 0
            Padding = $theme.PanelPadding
            Gap = $theme.Spacing
            KeyBindings = $this.Bindings
        }
        $root.Children.Add([Text]@{ Content = 'PowerShell log viewer'; FontSize = $theme.HeadingFontSize })
        $field = $theme.TextField
        $field.Label = 'Log message'
        $field.Width = [Length]::Percent(100)
        $field.Value = $this.Message
        $field.Controlled = $true
        $field.Handle = $this.InputHandle
        $field.OnChange = $this.ChangeMessage
        $field.OnSubmit = $this.SubmitMessage
        $root.Children.Add([Blob]$field)
        $actions = [Container]@{ FlexDirection = [FlexDirection]::Row; Gap = $theme.Spacing }
        $append = $theme.PrimaryButton
        $append.Content = 'Append'
        $append.OnClick = $this.AppendMessage
        $actions.Children.Add([Blob]$append)
        $collect = $theme.Button
        $collect.Content = 'Collect logs'
        $collect.OnClick = $this.CollectLogs
        $collect.Disabled = $null -ne $this.Job
        $actions.Children.Add([Blob]$collect)
        $clear = $theme.Button
        $clear.Content = 'Clear logs'
        $clear.OnClick = $this.OpenDialog
        $actions.Children.Add([Blob]$clear)
        $root.Children.Add($actions)
        $root.Children.Add([Text]@{ Content = $this.Status; Color = $theme.MutedTextColor })
        $root.Children.Add([Cell]::Mount[string[], LogRows]('log-rows', $this.Lines))
        $dialog = [ModalDialog]@{
            Open = $this.DialogOpen
            AccessibilityName = 'Clear log entries'
            Content = [Text]@{ Content = 'Clear all log entries?' }
            CancelText = 'Keep logs'
            ConfirmText = 'Clear logs'
            OnOpenChange = $this.ChangeDialog
            OnCancel = $this.CloseDialog
            OnConfirm = $this.ClearLogs
        }
        $root.Children.Add([Cell]::Mount[ModalDialog, ModalDialogHost]('clear-dialog', $dialog))
        return $root
    }
}

function Show-GooLog {
    [CmdletBinding()]
    param()
    $view = [LogView]::new()
    $window = [Window]@{ Title = 'PowerShell log viewer'; Size = [LayoutSize]::new(780, 560); Root = $view }
    [Theme]::Attach($window, [Theme]::GitHubDark)
    [Theme]::SetMode($window, [ThemeMode]::Dark)
    try {
        [Application]::Run($window)
    } finally {
        if ($null -ne $view.Job) { Remove-Job -Job $view.Job -Force }
    }
}

function Test-GooLog {
    [CmdletBinding()]
    param()
    $view = [LogView]::new()
    $view.ChangeMessage.Invoke('Checked callback')
    $view.AppendMessage.Invoke()
    if ($view.Lines[-1] -ne '0001  Checked callback' -or $view.Message -ne '') { throw 'Append failed' }
    $view.SubmitMessage.Invoke(' ')
    if ($view.Lines.Count -ne 2) { throw 'Blank input was not ignored' }
    $view.OpenDialog.Invoke()
    if (-not $view.DialogOpen) { throw 'Dialog did not open' }
    $view.ClearLogs.Invoke()
    if ($view.DialogOpen -or $view.Lines.Count -ne 0) { throw 'Clear failed' }
    foreach ($number in 1..501) { $view.AddLine("Entry $number") }
    if ($view.Lines.Count -ne 500 -or @($view.Lines | Select-Object -Unique).Count -ne 500) { throw 'Log bounds or keys differ' }
    $length = [Length]::Pixels(16)
    $color = [Color]::Rgb(13, 17, 23)
    if ($length.Magnitude -ne 16 -or [Math]::Abs($color.R - 13.0 / 255) -gt 0.00001) { throw 'Style conversions differ' }
    $delegate = [Func[int]]{ return [Environment]::CurrentManagedThreadId }
    $thread = [Environment]::CurrentManagedThreadId
    if ($delegate.Invoke() -ne $thread) { throw 'Delegate changed threads' }
    $task = [System.Threading.Tasks.Task]::Run($delegate)
    try {
        $null = $task.GetAwaiter().GetResult()
        throw 'A worker without a PowerShell runspace unexpectedly ran a scriptblock'
    } catch {
        if ($_.Exception.ToString() -notmatch 'runspace') { throw }
    }
    'PowerShell interop --check passed'
}

Export-ModuleMember -Function Show-GooLog, Test-GooLog
