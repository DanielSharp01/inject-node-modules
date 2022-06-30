#!/usr/bin/env node

import fs from 'fs-extra';
import klawSync from 'klaw-sync';
import path from 'path';
import glob from 'glob';
import minimatch from 'minimatch';
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

interface ServiceDefinition {
  path: string;
  has?: string;
}

interface Service {
  path: string;
  name: string;
}

type InjectDefinition = Record<string, { path: string, exclude?: string }>;

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

function getServices() {
  const newEntries = [...serviceGroupMap.entries()].map(([key, value]) => {
    const groupPath = value.path;
    const groupPathWithoutGlob = groupPath.replace('*', '');
    const services = (glob.sync(groupPath)).filter(service => 
      !value.has || fs.existsSync(path.join(service, value.has))).map(servicePath => ({
        name: servicePath.replace(groupPathWithoutGlob, ''),
        path: servicePath
      }));
    
    return [key, services] as [string, Service[]];
  });
  return new Map(newEntries);
}

function* getInjectablePaths(injectDestination: string, injectSource: { path: string, exclude?: string }): Generator<[string, { path: string, exclude?: string}], any, undefined> {
  const matches = injectSource.path.matchAll(/{([^}]+)}/g);
  const match = matches.next().value;
  if (match) {
    const key = match[1];
    const paths = [];
    for (const services of serviceMap.get(key)) {
      paths.push(...getInjectablePaths(injectDestination.replace(match[0], services.name), { path: injectSource.path.replace(match[0], services.path), exclude: injectSource.exclude }));
    }
    yield* paths;
  } else {
    yield [injectDestination, injectSource];
  }

}

function injectService(service: Service, definition: InjectDefinition) {
  for (const injectPath in definition) {
    const serviceInjectPath = path.join(service.path, injectPath);
    const injectSrc = definition[injectPath];
    for (const [injectDestination, injectSource] of getInjectablePaths(serviceInjectPath, injectSrc)) {
      injectServiceFromPath(injectDestination, injectSource);
      console.log(chalk.greenBright(`${chalk.cyanBright(service.name)} successfully injected 💉 with ${chalk.whiteBright(injectSource.path)}`));
    }
  }
}

function injectServiceFromPath(injectDestination: string, injectSource: { path: string, exclude?: string }) {
  
  for (const file of klawSync(injectSource.path, { filter: (f) => !minimatch(f.path, injectSource.exclude) })) {
    const relPath = file.path.replace(injectSource.path, '');
    fs.copySync(file.path, path.join(injectDestination, relPath), { overwrite: true });
  }
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