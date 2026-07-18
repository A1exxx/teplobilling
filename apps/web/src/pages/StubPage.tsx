import { Card, Tag, Typography } from 'antd'

interface StubPageProps {
  title: string
  phase: string
  details: string
}

export function StubPage({ title, phase, details }: StubPageProps) {
  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {title} <Tag style={{ marginInlineStart: 8 }}>{phase}</Tag>
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: '65ch', marginBottom: 0 }}>
        {details}
      </Typography.Paragraph>
    </Card>
  )
}
