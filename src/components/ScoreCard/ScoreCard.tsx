import React from 'react';
import { Card, Progress, Tag, Typography } from 'antd';
import type { ScoreResult, ScoreDimension } from '../../types';

const { Text } = Typography;

interface ScoreCardProps {
  score: ScoreResult;
}

function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    A: '#2A6DF4',
    B: '#3B82F6',
    C: '#60A5FA',
    D: '#94A3B8',
    F: '#64748B',
  };
  return colors[grade] || '#64748B';
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#2A6DF4';
  if (score >= 60) return '#60A5FA';
  return '#94A3B8';
}

const DimensionBar: React.FC<{ dim: ScoreDimension }> = ({ dim }) => (
  <div className="score-dimension">
    <div className="score-dimension__head">
      <Text className="score-dimension__title">{dim.dimension}（权重 {Math.round(dim.weight * 100)}%）</Text>
      <Text className="score-dimension__score">{dim.score.toFixed(1)} 分</Text>
    </div>
    <Progress
      percent={dim.score}
      showInfo={false}
      strokeColor={getScoreColor(dim.score)}
      railColor="rgba(148, 163, 184, 0.14)"
      size="small"
    />
    <Text className="score-dimension__detail">{dim.details}</Text>
  </div>
);

const ScoreCard: React.FC<ScoreCardProps> = ({ score }) => {
  const gradeColor = getGradeColor(score.grade);
  const gaugeDegree = Math.max(18, Math.round(score.total_score * 3.6));

  return (
    <Card title="质量评分" className="score-card" variant="borderless">
      <div className="score-card__body">
        <div className="score-card__summary">
          <div
            className="score-card__gauge-shell"
            style={{
              background: `conic-gradient(${gradeColor} 0deg, ${gradeColor} ${gaugeDegree}deg, rgba(255,255,255,0.54) ${gaugeDegree}deg, rgba(255,255,255,0.54) 360deg)`,
            }}
          >
            <div className="score-card__gauge-inner">
              <span className="score-card__grade" style={{ color: gradeColor }}>{score.grade}</span>
              <span className="score-card__grade-label">等级</span>
            </div>
          </div>

          <div className="score-card__score">
            {score.total_score.toFixed(1)}
            <span className="score-card__score-unit">/ 100</span>
          </div>

          <Tag
            className="score-card__summary-tag"
            style={{ color: gradeColor, borderColor: `${gradeColor}22`, background: `${gradeColor}12` }}
          >
            {score.summary}
          </Tag>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {score.dimensions.map((dim) => (
            <DimensionBar key={dim.dimension} dim={dim} />
          ))}
        </div>
      </div>
    </Card>
  );
};

export default ScoreCard;
