# AppHost API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/AppHost`](https://github.com/obselate/goo/tree/main/Goo/AppHost)

## `ActivationArguments`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/main/Goo/AppHost/ActivationArguments.gs)

Converts explicit desktop association arguments without changing the current directory.

### `Read(System.Collections.Generic.IReadOnlyList{string},string)`

Reads arguments without the executable name and copies the resulting request. Ordinary arguments produce Launch. Reserved leading flags select URI, documents or notification activation. --goo-open-uri requires one absolute URI. --goo-open-documents accepts URI or path values. Relative document paths resolve against workingDirectory. URI values do not grant document access.

- `arguments`: Argument values with their original boundaries, excluding the executable name.
- `workingDirectory`: The sender's captured working directory.

Returns: An owned initial activation, or Rejected for malformed or oversized association data.

## `ActivationReadResult`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/main/Goo/AppHost/ActivationArguments.gs)

Contains owned startup data or an explicit rejection.

### `Activation`

Gets the owned request when Accepted, or nil when Rejected.

### `Error`

Gets a bounded explanation without argument or document contents.

### `Status`

Gets whether the arguments formed a valid bounded request.

## `ActivationReadStatus`

Source:

- [`ActivationArguments.gs`](https://github.com/obselate/goo/blob/main/Goo/AppHost/ActivationArguments.gs)

Reports whether desktop startup arguments form an owned activation request.

### Values

- `Accepted`
- `Rejected`

## `Placement`

Source:
