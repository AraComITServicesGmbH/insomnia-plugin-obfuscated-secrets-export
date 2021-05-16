# insomnia-plugin-obfuscated-secrets-export

This plugin offers a  workspace export function which obfuscates your secret values that you don't want to be exposed in the export file.

The import function then asks the user to input or correct these values on import. 

Default values on import are either aggregated from 
- existing secret variables from the current environments 
- a stored version during export (only accessible to the plugin itself)

The definition in "Manage Environment" looks like:
```
  "my_secret_variable": {
    "_secret": "VerySecretValue"
  }
```

For the usage of the environment variable you use `_.my_secret_variable._secret` instead of `_.my_secret_variable`

The default key "_secret" can be changed by defining a custom key in the environment variable `insomnia_export_secrets_key`