/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';

interface ImpactBadgeProps {
	impact: 'baixo' | 'médio' | 'alto';
	className?: string;
}

export const ImpactBadge: React.FC<ImpactBadgeProps> = ({ impact, className = '' }) => {
	const getImpactColor = (impact: string) => {
		switch (impact) {
			case 'baixo':
				return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
			case 'médio':
				return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
			case 'alto':
				return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
			default:
				return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
		}
	};

	return (
		<span className={`px-2 py-0.5 text-xs rounded-full border border-solid ${getImpactColor(impact)} ${className}`}>
			{impact.toUpperCase()}
		</span>
	);
};
