# Notifications API

Generated from `Goo.Android.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Android/Notifications`](../../Goo.Android/Notifications)

## `AndroidNotifications`

Source:

- [`AndroidNotifications.gs`](../../Goo.Android/Notifications/AndroidNotifications.gs)

Opens Android notifications. Calls must run on the activity's UI thread.

### `Open(Android.GooActivity,NotificationOptions)`

Creates the channel and a service bound to the activity, without requesting permission.

- `owner`: The Goo activity that receives permission results and notification taps.
- `options`: The channel ID, channel name and installed drawable small-icon resource name.

Returns: An owned service on Success, or an identity or native failure.
