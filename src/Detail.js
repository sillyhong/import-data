import './App.css';
import React from 'react';
import { useState, useRouter, useEffect } from 'react';
import Table from 'react-bootstrap/Table';
import { useParams, useLocation } from 'react-router-dom';

function Detail(props) {
  // const routerParams = useParams()
  const { state } = useLocation()
  const [data, setData] = useState(null)
  useEffect(() => {
    if (state) {
      setData(state)
    }
  }, [state])
  return (
    <div className="App">
      {
        // props?.dataInfo && (
        //   <Table striped bordered hover>
        //     {/* 进出口信息 */}
        //     <thead>
        //       <tr>
        //         <th>进出口信息</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       <tr>
        //         <td>供应商</td>
        //         <td>供应商联系方式(地址)</td>
        //         <td>采购商</td>
        //         <td>采购商联系方式</td>
        //         <td>通知人</td>
        //         <td>通知人联系方式</td>
        //       </tr>
        //       <tr>
        //         <td>{dataInfo._source.shipper_name}</td>
        //         <td>{dataInfo._source.shipper_address}</td>
        //         <td>{dataInfo._source.importer}</td>
        //         <td>{dataInfo._source.consignee_address}</td>
        //       </tr>
        //     </tbody>

        //     {/* 货运信息 */}
        //     <thead>
        //       <tr>
        //         <th>进出口信息</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       <tr>
        //         <td>供应商</td>
        //         <td>采购商</td>
        //         <td>通知人</td>
        //       </tr>
        //       <tr>
        //         <td>2</td>
        //         <td>Jacob</td>
        //         <td>Thornton</td>
        //         <td>@fat</td>
        //       </tr>
        //       <tr>
        //         <td>3</td>
        //         <td colSpan={2}>Larry the Bird</td>
        //         <td>@twitter</td>
        //       </tr>
        //     </tbody>



        //     {/* 航运信息 */}
        //     <thead>
        //       <tr>
        //         <th>进出口信息</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       <tr>
        //         <td>供应商</td>
        //         <td>采购商</td>
        //         <td>通知人</td>
        //       </tr>
        //       <tr>
        //         <td>2</td>
        //         <td>Jacob</td>
        //         <td>Thornton</td>
        //         <td>@fat</td>
        //       </tr>
        //       <tr>
        //         <td>3</td>
        //         <td colSpan={2}>Larry the Bird</td>
        //         <td>@twitter</td>
        //       </tr>
        //     </tbody>

        //     {/* 集装箱信息 */}
        //     <thead>
        //       <tr>
        //         <th>进出口信息</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       <tr>
        //         <td>供应商</td>
        //         <td>采购商</td>
        //         <td>通知人</td>
        //       </tr>
        //       <tr>
        //         <td>2</td>
        //         <td>Jacob</td>
        //         <td>Thornton</td>
        //         <td>@fat</td>
        //       </tr>
        //       <tr>
        //         <td>3</td>
        //         <td colSpan={2}>Larry the Bird</td>
        //         <td>@twitter</td>
        //       </tr>
        //     </tbody>
        //   </Table>
        // )
      }
    </div>
  );
}

export default Detail;
