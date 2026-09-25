/** Special-shape creatures migrated to the shared bilateral fish renderer. */
export const usesMorphologyFishRenderer = (type: string, shape = 'FISH'): boolean =>
  shape === 'FISH' || (type === 'PUFFER_FISH' && shape === 'PUFFER')
    || (type === 'GREAT_WHITE' && shape === 'SHARK');

