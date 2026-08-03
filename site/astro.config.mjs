// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://policywright.lemmalabs.space',
  integrations: [
    starlight({
      title: 'Policywright',
      description:
        'Record a Soroban transaction, then synthesize the least-privilege OpenZeppelin smart-account authorization that permits exactly that flow.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/kunal-drall/policywright',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Overview', link: '/' },
        { label: 'Architecture', slug: 'architecture' },
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'Concepts',
          items: [
            { label: 'Context rules', slug: 'concepts/context-rules' },
            { label: 'Policies', slug: 'concepts/policies' },
            { label: 'Least-privilege model', slug: 'concepts/least-privilege' },
            { label: 'Design principle: compose-first', slug: 'concepts/compose-first' },
          ],
        },
        { label: 'Security', slug: 'security' },
        { label: 'Roadmap', slug: 'roadmap' },
        {
          label: 'Reference',
          items: [
            { label: 'CLI', slug: 'reference/cli' },
            { label: 'MCP tools', slug: 'reference/mcp-tools' },
          ],
        },
        { label: 'Changelog', slug: 'changelog' },
      ],
    }),
  ],
});
