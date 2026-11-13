class Counter : Goo.Cell {
    [int] $Count
    hidden [Goo.ElementHandle] $ButtonHandle = [Goo.ElementHandle]::new()
    hidden [Action] $Increment
    hidden [Goo.KeyBinding[]] $Bindings

    Counter() {
        $self = $this
        $this.Increment = { $self.Count++ }.GetNewClosure()
        $this.Bindings = [Goo.KeyBinding[]]@(
            [Goo.KeyBinding]@{ Key = 'Enter'; OnPress = { $null = $self.ButtonHandle.Activate() }.GetNewClosure() }
            [Goo.KeyBinding]@{
                Key = 'Space'
                OnPress = { $null = $self.ButtonHandle.BeginPress() }.GetNewClosure()
                OnRelease = { $null = $self.ButtonHandle.EndPress($true) }.GetNewClosure()
            }
        )
    }

    [Goo.Blob] Build() {
        $root = [Goo.Container]@{ Padding = 24; Gap = 12 }
        $root.Children.Add([Goo.Text]@{ Content = "Count: $($this.Count)" })
        $button = [Goo.Button]@{ Handle = $this.ButtonHandle; OnClick = $this.Increment; KeyBindings = $this.Bindings; Padding = 10 }
        $button.Children.Add([Goo.Text]@{ Content = 'Add one' })
        $root.Children.Add($button)
        return $root
    }
}
