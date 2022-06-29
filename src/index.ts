#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import globCallback from 'glob';
import { promisify } from 'util';
import yargs from 'yargs';
import chalk from 'chalk';

const argv = yargs(process.argv.slice(2))
  .string(['i', 'inject']).parseSync();

const injectFile = argv.inject ?? './inject.json';
if (!fs.existsSync(injectFile)) {
  console.error(chalk.redBright('Inject definition does not exist.')
    + '\n\nMake sure to have ./inject.json in your working directory or provide one by specifying -i or --inject');
  process.exit(1);
}

const glob = promisify(globCallback);

interface ServiceDefinition {
  path: string;
  has?: string;
}

interface Service {
  path: string;
  name: string;
}

type InjectDefinition = Record<string, string>;

interface NodeInjectDefinition {
  services: Record<string, ServiceDefinition>;
  inject: Record<string, InjectDefinition>;
}

function loadDefinition(): NodeInjectDefinition {
  return JSON.parse(fs.readFileSync(injectFile, 'utf-8'));
}

const definition = loadDefinition();

const serviceGroupMap = new Map(Object.entries(definition.services));
let serviceMap: Map<string, Service[]>;

async function getServices() {
  const newEntries = [...serviceGroupMap.entries()].map(async ([key, value]) => {
    const groupPath = value.path;
    const groupPathWithoutGlob = groupPath.replace('*', '');
    const services = (await glob(groupPath)).filter(service => 
      !value.has || fs.existsSync(path.join(service, value.has))).map(servicePath => ({
        name: servicePath.replace(groupPathWithoutGlob, ''),
        path: servicePath
      }));
    
    return [key, services] as [string, Service[]];
  });
  return new Map(await Promise.all(newEntries));
}

function* getInjectablePaths(injectDestination: string, injectSource: string): Generator<[string, string], any, undefined> {
  const matches = injectSource.matchAll(/{([^}]+)}/g);
  const match = matches.next().value;
  if (match) {
    const key = match[1];
    const paths = [];
    for (const services of serviceMap.get(key)) {
      paths.push(...getInjectablePaths(injectDestination.replace(match[0], services.name), injectSource.replace(match[0], services.path)));
    }
    yield* paths;
  } else {
    yield [injectDestination, injectSource];
  }

}

function injectService(service: Service, definition: InjectDefinition) {
  for (const injectPath in definition) {
    const serviceInjectPath = path.join(service.path, injectPath);
    const injectDest = definition[injectPath];
    for (const [injectDestination, injectSource] of getInjectablePaths(serviceInjectPath, injectDest)) {
      injectServiceFromPath(injectDestination, injectSource);
      console.log(chalk.greenBright(`${chalk.cyanBright(service.name)} successfully injected 💉 with ${chalk.whiteBright(injectSource)}`));
    }
  }
}

function injectServiceFromPath(injectDestination: string, injectSource: string) {
  fs.copySync(injectSource, injectDestination, { overwrite: true, recursive: true });
}

async function main() {
  serviceMap = await getServices();
  for (const inject in definition.inject) {
    for (const service of serviceMap.get(inject)) {
      injectService(service, definition.inject[inject]);
    }
  }
}

main();