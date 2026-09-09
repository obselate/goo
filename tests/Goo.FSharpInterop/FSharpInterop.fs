namespace Goo.FSharpInterop

open System
open Goo

type ITrackedCell =
    abstract BuildCount: int
    abstract WasDisposed: bool

[<Sealed>]
type MountStore(initialPayload: string, initialTick: int) as this =
    let mutable payload = initialPayload
    let mutable tick = initialTick
    let mutable readerCalls = 0
    let mutable factoryCalls = 0
    let mutable disposalCalls = 0
    let mutable createdCell: Cell = Unchecked.defaultof<Cell>
    let currentTickReader = Func<int>(fun () -> this.ReadCurrentTick())

    member _.Payload
        with get() = payload
        and set(value) = payload <- value

    member _.Tick
        with get() = tick
        and set(value) = tick <- value

    member _.ReaderCalls = readerCalls
    member _.FactoryCalls = factoryCalls
    member _.DisposalCalls = disposalCalls
    member _.CreatedCell = createdCell

    member _.ReadCurrentTick() =
        readerCalls <- readerCalls + 1
        tick

    member _.CurrentTickReader =
        currentTickReader

    member this.CreateCell() =
        factoryCalls <- factoryCalls + 1
        let mutable cellBuildCalls = 0
        let mutable cellWasDisposed = false
        let cell =
            { new Cell() with
                override _.Build() : Blob =
                    cellBuildCalls <- cellBuildCalls + 1
                    let currentTick = this.CurrentTickReader.Invoke()
                    Text(Content = this.Payload + ":" + string currentTick)
              interface IDisposable with
                member _.Dispose() =
                    cellWasDisposed <- true
                    disposalCalls <- disposalCalls + 1
              interface ITrackedCell with
                member _.BuildCount = cellBuildCalls
                member _.WasDisposed = cellWasDisposed
            }
        createdCell <- cell
        cell

    member this.DirectMount(key: string) : Blob =
        let factory = Func<Cell>(fun () -> this.CreateCell())
        Cell.Mount<Cell>(factory, key)

    member this.CurriedMount(key: string) : Blob =
        let mount key (create: unit -> Cell) =
            Cell.Mount<Cell>(Func<Cell>(create), key)
        mount key (fun () -> this.CreateCell())

[<Sealed>]
type MountScenario(store: MountStore, key: string, useCurriedFactory: bool) =
    let mutable childVisible = true
    let mutable currentKey = key
    let root =
        { new Cell() with
            override _.Build() : Blob =
                let container = Container()
                if childVisible then
                    let child =
                        if useCurriedFactory then
                            store.CurriedMount(currentKey)
                        else
                            store.DirectMount(currentKey)
                    container.Children.Add(child)
                container :> Blob }

    member _.Root = root

    member _.Key
        with get() = currentKey
        and set(value) = currentKey <- value

    member _.ChildVisible
        with get() = childVisible
        and set(value) = childVisible <- value
