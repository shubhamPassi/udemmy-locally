import { useState } from 'react';

import {SearchContext} from './contextTypes.js'

export function SearchProvider({ children }) {
    const [searchQuery, setSearchQuery] = useState('')

    return (
        <SearchContext.Provider value={{ searchQuery, setSearchQuery }}>
            {children}
        </SearchContext.Provider>
    )
}
