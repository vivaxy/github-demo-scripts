/**
 * @since 2024-03-21
 * @author vivaxy
 */
import { Argv, Options } from 'yargs';
import { cosmiconfig } from 'cosmiconfig';

export async function createCommandBuilder<T extends Object>(
  yargs: Argv<T>,
  options: { [key: string]: Options },
) {
  const explorer = cosmiconfig('gps');
  const cosmiconfigResult = await explorer.search();
  const { config = {} } = cosmiconfigResult || {};
  return yargs.config(config).options(options);
}
