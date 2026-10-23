Imports System
Imports System.Collections.Generic
Imports System.Linq
Imports System.Threading.Tasks
Imports Goo
Imports Goo.Widgets.Data
Imports Goo.Widgets.Layout

Module Program
    Sub Main(args As String())
        Dim sample = If(args.FirstOrDefault(), "counter")
        Dim window = New Window With {.Title = "VB interop", .Width = 640, .Height = 480, .Root = New Examples(sample)}
        Dim focused As Action(Of Boolean) = Sub(value) Console.WriteLine($"Focused: {value}")
        AddHandler window.FocusChanged, focused
        RemoveHandler window.FocusChanged, focused
        If args.Contains("--check") Then
            Dim counter = New Counter()
            DirectCast(DirectCast(counter.Build(), Container).Children(1), Button).OnClick.Invoke()
            If DirectCast(DirectCast(counter.Build(), Container).Children(0), Text).Content <> "Count: 1" Then
                Throw New InvalidOperationException("Counter failed.")
            End If
            If Examples.ListView({"Ada", "Grace"}).Children.Count <> 4 Then
                Throw New InvalidOperationException("Spread failed.")
            End If
            Console.WriteLine("VB interop checks passed.")
        Else
            window.Run()
        End If
    End Sub
End Module

Public NotInheritable Class Counter
    Inherits Cell
    Private count As Integer
    Public Overrides Function Build() As Blob
        Return New Container With {
            .Padding = 24, .Gap = 12,
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"Count: {count}"},
                New Button With {
                    .Padding = 10, .BorderRadius = 10,
                    .TransitionMs = 150, .Hover = New Style With {.BackgroundColor = Color.Rgb(74, 125, 255)},
                    .OnClick = AddressOf Increment,
                    .Children = New List(Of Blob) From {New Text With {.Content = "Add one"}}
                }
            }
        }
    End Function
    Private Sub Increment()
        count += 1
        Rebuild()
    End Sub
End Class

Public NotInheritable Class AccountInput
    Public ReadOnly Property Name As String
    Public Sub New(name As String)
        Me.Name = name
    End Sub
End Class

Public NotInheritable Class AccountCell
    Inherits Cell(Of AccountInput)
    Private edits As Integer
    Protected Overrides Function Build(input As AccountInput) As Blob
        Return New Button With {.OnClick = AddressOf Edit,
            .Children = New List(Of Blob) From {New Text With {.Content = $"{input.Name}: {edits}"}}}
    End Function
    Private Sub Edit()
        edits += 1
        Rebuild()
    End Sub
End Class

Public NotInheritable Class Examples
    Inherits Cell
    Private ReadOnly sample As String
    Private isOpen As Boolean
    Private ReadOnly items As String()
    Private Shared ReadOnly itemKey As Func(Of String, String) = Function(value) value
    Private Shared ReadOnly buildRow As Func(Of String, Blob) = Function(value) New Text With {.Content = value}
    Public Sub New(sample As String)
        Me.sample = sample
        items = If(sample = "virtual",
            Enumerable.Range(0, 10000).Select(Function(i) $"Item {i:D5}").ToArray(), Array.Empty(Of String)())
    End Sub

    Public Shared Function ListView(data As IEnumerable(Of String)) As Container
        Dim rows = data.Select(Function(value) DirectCast(New Text With {.Key = value, .Content = value}, Blob))
        Dim children = New List(Of Blob) From {New Text With {.Content = "Account"}}
        children.AddRange(rows)
        children.Add(New Button With {.OnClick = Sub() Console.WriteLine("Save"),
            .Children = New List(Of Blob) From {New Text With {.Content = "Save"}}})
        Return New Container With {.Width = Length.Pixels(320), .MaxWidth = Length.Percent(100),
            .Padding = 12, .Gap = 8, .Children = children}
    End Function

    Public Overrides Function Build() As Blob
        Select Case sample
            Case "list"
                Return ListView({"Ada", "Grace", "Linus"})
            Case "input"
                Return Cell.Mount(Of AccountInput, AccountCell)("account", New AccountInput("Ada"))
            Case "virtual"
                Return VirtualLists.Rows(items, 24, itemKey, buildRow)
            Case "variants"
                Dim basic = New Style With {
                    .Padding = 10, .BorderRadius = 10, .BackgroundColor = Color.Rgb(24, 31, 43)}
                Return New Container With {.Gap = 12, .Children = New List(Of Blob) From {
                    New Button With {
                        .BasedOn = basic, .Children = New List(Of Blob) From {New Text With {.Content = "Base"}}},
                    New Button With {.BasedOn = basic, .BackgroundColor = Color.Rgb(74, 125, 255),
                        .Children = New List(Of Blob) From {New Text With {.Content = "Primary"}}}}}
            Case "layout"
                Return New Container With {.Height = 200, .Layout = New EqualColumn(),
                    .Children = New List(Of Blob) From {
                        New Text With {.Content = "One"}, New Text With {.Content = "Two"}}}
            Case "dialog"
                Dim dialog = New ModalDialog With {
                    .Open = isOpen, .Content = New Text With {.Content = "Save account?"},
                    .Padding = 20, .OnClose = AddressOf CloseDialog,
                    .OnCancel = AddressOf CloseDialog, .OnConfirm = AddressOf CloseDialog}
                Return New Container With {.Children = New List(Of Blob) From {
                    New Button With {
                        .OnClick = AddressOf OpenDialog,
                        .Children = New List(Of Blob) From {New Text With {.Content = "Open dialog"}}},
                    Cell.Mount(Of ModalDialog, ModalDialogHost)("dialog", dialog)}}
            Case Else
                Return Cell.Mount(Of Counter)("counter")
        End Select
    End Function
    Private Sub OpenDialog()
        isOpen = True
        Rebuild()
    End Sub
    Private Sub CloseDialog()
        isOpen = False
        Rebuild()
    End Sub
    Public Shared Function HitTest(handle As ElementHandle, point As Point) As TextPosition?
        Dim position As TextPosition
        If handle.TryGetTextPositionAt(point, TextCoordinateSpace.Window, position) Then Return position
        Return Nothing
    End Function
    Public Shared Async Function PickFile(window As Window) As Task(Of FileDialogResult)
        Return Await window.ShowFileDialogAsync(FileDialogKind.OpenFile)
    End Function
End Class

Public NotInheritable Class EqualColumn
    Implements LayoutAlgorithm
    Public Function Measure(context As LayoutContext, available As LayoutSize) As LayoutSize _
        Implements LayoutAlgorithm.Measure
        Dim width As Double = 0
        Dim height As Double = 0
        For i = 0 To context.ChildCount - 1
            Dim child = context.MeasureChild(i, available)
            width = Math.Max(width, child.Width)
            height += child.Height
        Next
        Return New LayoutSize With {
            .Width = Math.Min(width, available.Width), .Height = Math.Min(height, available.Height)}
    End Function
    Public Sub Arrange(context As LayoutContext, finalSize As LayoutSize) Implements LayoutAlgorithm.Arrange
        Dim height = If(context.ChildCount = 0, 0, finalSize.Height / context.ChildCount)
        For i = 0 To context.ChildCount - 1
            context.ArrangeChild(i, New ElementRect With {.Y = i * height, .Width = finalSize.Width, .Height = height})
        Next
    End Sub
End Class
