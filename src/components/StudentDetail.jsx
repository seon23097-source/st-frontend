import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { evaluationsAPI } from '../utils/api';
import './StudentDetail.css';

function StudentDetail({ student, categories, onClose }) {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const radarCanvasRef = useRef(null);

  useEffect(() => {
    loadStudentData();
  }, [student.id]);

  useEffect(() => {
    setSelectedCategories(categories.map(c => c.id));
  }, [categories]);

  useEffect(() => {
    if (!loading && evaluations.length > 0) {
      drawRadarChart();
    }
  }, [loading, evaluations, selectedCategories]);

  const loadStudentData = async () => {
    try {
      const data = await evaluationsAPI.getByStudent(student.id);
      setEvaluations(data);
    } catch (error) {
      console.error('학생 평가 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const drawRadarChart = () => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 60;

    ctx.clearRect(0, 0, W, H);

    const activeCats = categories.filter(c => selectedCategories.includes(c.id));
    if (activeCats.length === 0) return;

    const N = activeCats.length;
    const angleStep = (2 * Math.PI) / N;
    const startAngle = -Math.PI / 2;

    const getAngle = (i) => startAngle + i * angleStep;
    const getAxisPoint = (i, r) => ({
      x: cx + r * Math.cos(getAngle(i)),
      y: cy + r * Math.sin(getAngle(i))
    });

    const gridLevels = 5;
    for (let level = 1; level <= gridLevels; level++) {
      const r = R * (level / gridLevels);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const p = getAxisPoint(i, r);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (N > 0) {
        const labelPct = Math.round((level / gridLevels) * 100);
        ctx.fillStyle = '#999';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        const lp = getAxisPoint(0, r);
        ctx.fillText(`${labelPct}%`, lp.x + 3, lp.y - 2);
      }
    }

    activeCats.forEach((_, i) => {
      const p = getAxisPoint(i, R);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    activeCats.forEach((cat, i) => {
      const p = getAxisPoint(i, R + 25);
      ctx.fillStyle = '#1A1A1A';
      ctx.font = 'bold 13px Noto Sans KR, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.name, p.x, p.y);
    });

    activeCats.forEach((cat, i) => {
      const catEvals = evaluations
        .filter(e => e.category_id === cat.id)
        .sort((a, b) => new Date(a.evaluation_date) - new Date(b.evaluation_date));

      if (catEvals.length === 0) return;

      catEvals.forEach((evalData, idx) => {
        const pct = parseFloat(evalData.score) / cat.max_score;
        const r = R * pct;
        const p = getAxisPoint(i, r);

        const opacity = catEvals.length === 1
          ? 1
          : 0.25 + (0.75 * idx) / (catEvals.length - 1);

        const hue = (i * 360) / activeCats.length;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = `hsla(${hue}, 70%, 45%, ${opacity})`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${hue}, 70%, 35%, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    });

    canvas._tooltipData = activeCats.map((cat, i) => {
      const catEvals = evaluations
        .filter(e => e.category_id === cat.id)
        .sort((a, b) => new Date(a.evaluation_date) - new Date(b.evaluation_date));

      return catEvals.map(evalData => {
        const pct = parseFloat(evalData.score) / cat.max_score;
        const r = R * pct;
        const p = getAxisPoint(i, r);
        return {
          x: p.x, y: p.y,
          label: `${cat.name}\n${evalData.evaluation_date}\n${evalData.score}/${cat.max_score} (${Math.round(pct * 100)}%)`
        };
      });
    }).flat();
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = radarCanvasRef.current;
    if (!canvas || !canvas._tooltipData) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let nearest = null;
    let minDist = 15;

    canvas._tooltipData.forEach(pt => {
      const dist = Math.sqrt((mx - pt.x) ** 2 + (my - pt.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = pt;
      }
    });

    const tooltip = document.getElementById('radar-tooltip');
    if (nearest && tooltip) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
      tooltip.innerText = nearest.label;
    } else if (tooltip) {
      tooltip.style.display = 'none';
    }
  };

  const handleCanvasMouseLeave = () => {
    const tooltip = document.getElementById('radar-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  };

  const getLineChartData = () => {
    const dateMap = {};
    evaluations.forEach(evalData => {
      if (!selectedCategories.includes(evalData.category_id)) return;
      if (!dateMap[evalData.evaluation_date]) {
        dateMap[evalData.evaluation_date] = { date: evalData.evaluation_date };
      }
      const pct = (parseFloat(evalData.score) / evalData.max_score) * 100;
      if (dateMap[evalData.evaluation_date][evalData.category_name] === undefined) {
        dateMap[evalData.evaluation_date][evalData.category_name] = pct;
        dateMap[evalData.evaluation_date][`${evalData.category_name}_count`] = 1;
      } else {
        const prev = dateMap[evalData.evaluation_date][evalData.category_name];
        const count = dateMap[evalData.evaluation_date][`${evalData.category_name}_count`] + 1;
        dateMap[evalData.evaluation_date][evalData.category_name] = (prev * (count - 1) + pct) / count;
        dateMap[evalData.evaluation_date][`${evalData.category_name}_count`] = count;
      }
    });
    return Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const getColor = (index, total) => {
    const hue = (index * 360) / total;
    return `hsl(${hue}, 70%, 45%)`;
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="student-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="student-detail-loading">
            <div className="spinner"></div>
            <p>로딩 중...</p>
          </div>
        </div>
      </div>
    );
  }

  const activeCats = categories.filter(c => selectedCategories.includes(c.id));
  const lineChartData = getLineChartData();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div id="radar-tooltip" style={{
        display: 'none',
        position: 'fixed',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.6',
        whiteSpace: 'pre',
        pointerEvents: 'none',
        zIndex: 9999
      }} />

      <div className="student-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{student.student_number}번 {student.name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="student-detail-content">
          {evaluations.length === 0 ? (
            <div className="no-data"><p>평가 기록이 없습니다.</p></div>
          ) : (
            <>
              <div className="category-filter">
                <h4>카테고리 선택</h4>
                <div className="category-checkboxes">
                  {categories.map(cat => (
                    <label key={cat.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                      />
                      <span>{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="student-detail-charts">
                <div className="chart-section">
                  <h4>카테고리별 전체 기록</h4>
                  <p className="chart-description">
                    각 축의 점들은 해당 카테고리의 모든 평가 기록입니다.
                    진한 색일수록 최근 기록입니다.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <canvas
                      ref={radarCanvasRef}
                      width={400}
                      height={400}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseLeave={handleCanvasMouseLeave}
                      style={{ cursor: 'crosshair' }}
                    />
                  </div>
                </div>

                <div className="chart-section">
                  <h4>시간에 따른 변화</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={lineChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E0E6ED" />
                      <XAxis dataKey="date" stroke="#5A5A5A" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#5A5A5A" tick={{ fontSize: 12 }} domain={[0, 100]}
                        label={{ value: '백분율 (%)', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: '#FFF', border: '2px solid #E0E6ED', borderRadius: '8px' }} />
                      <Legend />
                      {activeCats.map((cat, idx) => (
                        <Line
                          key={cat.id}
                          type="monotone"
                          dataKey={cat.name}
                          stroke={getColor(idx, activeCats.length)}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentDetail;