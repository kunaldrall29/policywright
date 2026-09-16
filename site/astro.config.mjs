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
        {
          label: 'Guides',
          items: [
            { label: 'Smart-account install', slug: 'guides/smart-account-install' },
            { label: 'Dry-run & argument scope', slug: 'guides/argument-scope' },
          ],
        },
        {
          label: 'Use cases',
          items: [
            { label: 'Agent yield operations', slug: 'use-cases/agent-yield-operations' },
            { label: 'SEP-41 subscription', slug: 'use-cases/sep-41-subscription' },
            {
              label: 'Bounded Soroswap delegation',
              slug: 'use-cases/bounded-soroswap-delegation',
            },
            { label: 'Why least-privilege for agents', slug: 'use-cases/why-least-privilege' },
          ],
        },
        { label: 'Security', slug: 'security' },
        { label: 'Roadmap', slug: 'roadmap' },
        {
          label: 'Reference',
          items: [
            { label: 'CLI', slug: 'reference/cli' },
            { label: 'MCP tools', slug: 'reference/mcp-tools' },
            { label: 'Claude skill', slug: 'reference/claude-skill' },
          ],
        },
        { label: 'Changelog', slug: 'changelog' },
      ],
    }),
  ],
});
