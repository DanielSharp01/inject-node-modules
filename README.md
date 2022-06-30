# inject-node-modules

Inject node modules is for all those times when you need to inject something into already installed node modules because of any reason. But you can use it with any sort of folders not just node_modules.

## Installing

Run `npm run build` then `npm link` and you are ready to use proto3-renumber from the CLI.

## Usage

Provide your injection file to the program to work it's magic

```
inject-node-modules --inject "./inject.json"
```

## Injection descriptor file format

```json
{
  "services": {
    "injectableService": {
      "path": "./services/*"
    },
    "injectedService": {
      "path": "./services/*",
      "has": "injectable-folder"
    },
    "namedService": {
      "name": "name",
      "path": "./services/name",
      "has": "injectable-folder"
    }
  },
  "inject": {
    "injectableService": {
      "node_modules/your-module/injectable-folder/{injectedService}": {
        "path": "{injectedService}/injectable-folder",
        "exclude": "optionalExclude/**/glob"
      }
    }
  }
}
```

First declare your named service groups which end in a `/*` to get names. You can also use the `has` field on a service group to require a certain folder.

After this declare all the injections that should take place on each service, starting with the group name as key and as value path-path pairs.

The first path will be the injection destination inside of the injectable service and the second path will be the injected content.

**Note:** The contents of the folder and not the folders themselves are injected. Think of it as `cp destination source`.